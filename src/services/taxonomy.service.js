
'use strict';

const { db } = require('../config/firebase');

// ========================================
// Configuration
// ========================================

const COLLECTIONS = 'taxonomyCollections';
const META_COLLECTION = 'meta';
const META_DOCUMENT = 'taxonomy';

const MAX_DOCUMENT_SIZE = 900 * 1024;

// ========================================
// Custom Error
// ========================================

class TaxonomyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'TaxonomyError';
    this.status = status;
  }
}

// ========================================
// Firestore References
// ========================================

function getCollectionsRef() {
  return db.collection(COLLECTIONS);
}

function getCollectionRef(collectionId) {
  return getCollectionsRef().doc(collectionId);
}

function getMetaRef() {
  return db.collection(META_COLLECTION).doc(META_DOCUMENT);
}

// ========================================
// Validation Helpers
// ========================================

function validateName(value, field = 'name') {
  if (typeof value !== 'string') {
    throw new TaxonomyError(`${field} must be a string`);
  }

  const name = value.trim();

  if (!name) {
    throw new TaxonomyError(`${field} is required`);
  }

  if (name.length > 100) {
    throw new TaxonomyError(
      `${field} cannot exceed 100 characters`
    );
  }

  return name;
}

function validateId(value, field = 'id') {
  if (typeof value !== 'string') {
    throw new TaxonomyError(`${field} must be a string`);
  }

  const id = value.trim();

  if (
    !id ||
    id.length > 128 ||
    !/^[\p{L}\p{N}_-]+$/u.test(id)
  ) {
    throw new TaxonomyError(`Invalid ${field}`);
  }

  return id;
}

function createSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function validateActive(value, fallback = true) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    throw new TaxonomyError('active must be a boolean');
  }

  return value;
}

function validateIcon(value, fallback = '') {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string') {
    throw new TaxonomyError('icon must be a string');
  }

  const icon = value.trim();

  if (icon.length > 50) {
    throw new TaxonomyError('icon cannot exceed 50 characters');
  }

  return icon;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function validateDocumentSize(data) {
  const size = Buffer.byteLength(
    JSON.stringify(data),
    'utf8'
  );

  if (size > MAX_DOCUMENT_SIZE) {
    throw new TaxonomyError(
      'Taxonomy document is too large. Maximum application limit is 900 KB.',
      413
    );
  }
}

// ========================================
// Subcategory Compatibility
// ========================================

// Firestore-এর পুরোনো এবং নতুন দুই field name support করবে.
function getSubcategories(category) {
  return ensureArray(
    category.subCategories ?? category.subcategories
  );
}

// Canonical field: subCategories
function setSubcategories(category, items) {
  category.subCategories = items;

  // পুরোনো lowercase field সরিয়ে দেবে।
  delete category.subcategories;
}

// ========================================
// Metadata / Version
// ========================================

function normalizeVersion(value) {
  const version = Number(value);

  if (!Number.isSafeInteger(version) || version < 0) {
    return 0;
  }

  return version;
}

function createNextMeta(meta = {}) {
  return {
    version: normalizeVersion(meta.version) + 1,
    updatedAt: Date.now()
  };
}

async function getTaxonomyMeta() {
  const snapshot = await getMetaRef().get();

  if (!snapshot.exists) {
    return {
      version: 0,
      updatedAt: 0
    };
  }

  const data = snapshot.data() || {};

  return {
    version: normalizeVersion(data.version),
    updatedAt: Number(data.updatedAt) || 0
  };
}

// ========================================
// List Collections
// ========================================

async function listCollections(clientVersion = null) {
  const meta = await getTaxonomyMeta();

  const hasClientVersion =
    clientVersion !== null &&
    clientVersion !== undefined &&
    clientVersion !== '';

  const parsedClientVersion = hasClientVersion
    ? Number(clientVersion)
    : null;

  if (
    hasClientVersion &&
    Number.isSafeInteger(parsedClientVersion) &&
    parsedClientVersion >= 0 &&
    parsedClientVersion === meta.version
  ) {
    return {
      unchanged: true,
      version: meta.version,
      updatedAt: meta.updatedAt,
      collections: null
    };
  }

  const snapshot = await getCollectionsRef().get();

  const collections = snapshot.docs
    .map(doc => ({
      ...doc.data(),
      id: doc.id
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    unchanged: false,
    version: meta.version,
    updatedAt: meta.updatedAt,
    collections
  };
}

// ========================================
// Get Single Collection
// ========================================

async function getCollection(collectionId) {
  collectionId = validateId(
    collectionId,
    'collectionId'
  );

  const snapshot = await getCollectionRef(collectionId).get();

  if (!snapshot.exists) {
    throw new TaxonomyError('Collection not found', 404);
  }

  return {
    ...snapshot.data(),
    id: snapshot.id
  };
}

// ========================================
// Transaction Helper
// ========================================

async function mutateCollection(collectionId, mutator) {
  collectionId = validateId(
    collectionId,
    'collectionId'
  );

  const collectionRef = getCollectionRef(collectionId);
  const metaRef = getMetaRef();

  return db.runTransaction(async transaction => {
    const [collectionSnapshot, metaSnapshot] = await Promise.all([
      transaction.get(collectionRef),
      transaction.get(metaRef)
    ]);

    if (!collectionSnapshot.exists) {
      throw new TaxonomyError('Collection not found', 404);
    }

    const current = collectionSnapshot.data() || {};

    const updated = await mutator({
      ...current,
      id: collectionId
    });

    if (!updated) {
      return null;
    }

    updated.id = collectionId;

    validateDocumentSize(updated);

    const nextMeta = createNextMeta(
      metaSnapshot.exists ? metaSnapshot.data() : {}
    );

    transaction.set(collectionRef, updated);
    transaction.set(metaRef, nextMeta);

    return updated;
  });
}

// ========================================
// Create Collection
// ========================================

async function createCollection(payload = {}) {
  const id = validateId(payload.id, 'collection id');
  const name = validateName(payload.name);
  const active = validateActive(payload.active);
  const icon = validateIcon(payload.icon);

  const collectionRef = getCollectionRef(id);
  const metaRef = getMetaRef();

  const newCollection = {
    id,
    name,
    active,
    icon,
    categories: []
  };

  validateDocumentSize(newCollection);

  await db.runTransaction(async transaction => {
    const [collectionSnapshot, metaSnapshot] = await Promise.all([
      transaction.get(collectionRef),
      transaction.get(metaRef)
    ]);

    if (collectionSnapshot.exists) {
      throw new TaxonomyError(
        'Collection already exists',
        409
      );
    }

    const nextMeta = createNextMeta(
      metaSnapshot.exists ? metaSnapshot.data() : {}
    );

    transaction.create(collectionRef, newCollection);
    transaction.set(metaRef, nextMeta);
  });

  return newCollection;
}

// ========================================
// Update Collection
// ========================================

async function updateCollection(collectionId, payload = {}) {
  return mutateCollection(collectionId, collection => {
    if (payload.name !== undefined) {
      collection.name = validateName(payload.name);
    }

    if (payload.active !== undefined) {
      collection.active = validateActive(payload.active);
    }

    if (payload.icon !== undefined) {
      collection.icon = validateIcon(payload.icon);
    }

    return collection;
  });
}

// ========================================
// Delete Collection
// ========================================

async function deleteCollection(collectionId) {
  collectionId = validateId(
    collectionId,
    'collectionId'
  );

  const collectionRef = getCollectionRef(collectionId);
  const metaRef = getMetaRef();

  await db.runTransaction(async transaction => {
    const [collectionSnapshot, metaSnapshot] = await Promise.all([
      transaction.get(collectionRef),
      transaction.get(metaRef)
    ]);

    if (!collectionSnapshot.exists) {
      throw new TaxonomyError('Collection not found', 404);
    }

    const nextMeta = createNextMeta(
      metaSnapshot.exists ? metaSnapshot.data() : {}
    );

    transaction.delete(collectionRef);
    transaction.set(metaRef, nextMeta);
  });

  return {
    success: true,
    id: collectionId
  };
}

// ========================================
// Create Category
// ========================================

async function createCategory(collectionId, payload = {}) {
  const name = validateName(payload.name);
  const active = validateActive(payload.active);
  const icon = validateIcon(payload.icon);

  const categoryId = payload.id
    ? validateId(payload.id, 'category id')
    : validateId(
        `${collectionId}-${createSlug(name)}`,
        'category id'
      );

  const newCategory = {
    id: categoryId,
    name,
    active,
    icon,
    subCategories: []
  };

  await mutateCollection(collectionId, collection => {
    const categories = ensureArray(collection.categories);

    if (categories.some(item => item.id === categoryId)) {
      throw new TaxonomyError(
        'Category already exists',
        409
      );
    }

    collection.categories = [
      ...categories,
      newCategory
    ];

    return collection;
  });

  return newCategory;
}

// ========================================
// Update Category
// ========================================

async function updateCategory(
  collectionId,
  categoryId,
  payload = {}
) {
  categoryId = validateId(categoryId, 'categoryId');

  return mutateCollection(collectionId, collection => {
    const categories = ensureArray(collection.categories);

    const category = categories.find(
      item => item.id === categoryId
    );

    if (!category) {
      throw new TaxonomyError('Category not found', 404);
    }

    if (payload.name !== undefined) {
      category.name = validateName(payload.name);
    }

    if (payload.active !== undefined) {
      category.active = validateActive(payload.active);
    }

    if (payload.icon !== undefined) {
      category.icon = validateIcon(payload.icon);
    }

    collection.categories = categories;

    return collection;
  });
}

// ========================================
// Delete Category
// ========================================

async function deleteCategory(collectionId, categoryId) {
  categoryId = validateId(categoryId, 'categoryId');

  return mutateCollection(collectionId, collection => {
    const categories = ensureArray(collection.categories);

    const exists = categories.some(
      item => item.id === categoryId
    );

    if (!exists) {
      throw new TaxonomyError('Category not found', 404);
    }

    collection.categories = categories.filter(
      item => item.id !== categoryId
    );

    return collection;
  });
}

// ========================================
// Create Subcategory
// ========================================

async function createSubcategory(
  collectionId,
  categoryId,
  payload = {}
) {
  categoryId = validateId(categoryId, 'categoryId');

  const name = validateName(payload.name);
  const active = validateActive(payload.active);
  const icon = validateIcon(payload.icon);

  const subCategoryId = payload.id
    ? validateId(payload.id, 'subcategory id')
    : validateId(
        `${categoryId}-${createSlug(name)}`,
        'subcategory id'
      );

  const newSubCategory = {
    id: subCategoryId,
    name,
    active,
    icon
  };

  await mutateCollection(collectionId, collection => {
    const categories = ensureArray(collection.categories);

    const category = categories.find(
      item => item.id === categoryId
    );

    if (!category) {
      throw new TaxonomyError('Category not found', 404);
    }

    const subCategories = getSubcategories(category);

    if (subCategories.some(item => item.id === subCategoryId)) {
      throw new TaxonomyError(
        'Subcategory already exists',
        409
      );
    }

    setSubcategories(category, [
      ...subCategories,
      newSubCategory
    ]);

    collection.categories = categories;

    return collection;
  });

  return newSubCategory;
}

// ========================================
// Update Subcategory
// ========================================

async function updateSubcategory(
  collectionId,
  categoryId,
  subCategoryId,
  payload = {}
) {
  categoryId = validateId(categoryId, 'categoryId');
  subCategoryId = validateId(
    subCategoryId,
    'subCategoryId'
  );

  return mutateCollection(collectionId, collection => {
    const categories = ensureArray(collection.categories);

    const category = categories.find(
      item => item.id === categoryId
    );

    if (!category) {
      throw new TaxonomyError('Category not found', 404);
    }

    const subCategories = getSubcategories(category);

    const subCategory = subCategories.find(
      item => item.id === subCategoryId
    );

    if (!subCategory) {
      throw new TaxonomyError('Subcategory not found', 404);
    }

    if (payload.name !== undefined) {
      subCategory.name = validateName(payload.name);
    }

    if (payload.active !== undefined) {
      subCategory.active = validateActive(payload.active);
    }

    if (payload.icon !== undefined) {
      subCategory.icon = validateIcon(payload.icon);
    }

    setSubcategories(category, subCategories);

    collection.categories = categories;

    return collection;
  });
}

// ========================================
// Delete Subcategory
// ========================================

async function deleteSubcategory(
  collectionId,
  categoryId,
  subCategoryId
) {
  categoryId = validateId(categoryId, 'categoryId');
  subCategoryId = validateId(
    subCategoryId,
    'subCategoryId'
  );

  return mutateCollection(collectionId, collection => {
    const categories = ensureArray(collection.categories);

    const category = categories.find(
      item => item.id === categoryId
    );

    if (!category) {
      throw new TaxonomyError('Category not found', 404);
    }

    const subCategories = getSubcategories(category);

    const exists = subCategories.some(
      item => item.id === subCategoryId
    );

    if (!exists) {
      throw new TaxonomyError('Subcategory not found', 404);
    }

    const updatedSubcategories = subCategories.filter(
      item => item.id !== subCategoryId
    );

    setSubcategories(category, updatedSubcategories);

    collection.categories = categories;

    return collection;
  });
}

// ========================================
// Exports
// ========================================

module.exports = {
  TaxonomyError,

  getTaxonomyMeta,
  listCollections,
  getCollection,

  createCollection,
  updateCollection,
  deleteCollection,

  createCategory,
  updateCategory,
  deleteCategory,

  createSubcategory,
  updateSubcategory,
  deleteSubcategory
};
