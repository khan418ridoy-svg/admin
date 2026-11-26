
import { db } from "../config/firebase.js";

import {
  validateCollectionId,
  validateCategoryId,
  validateSubcategoryId,
  validateCategory,
  validateSubcategory
} from "./catalog.validator.js";

const COLLECTIONS = "taxonomyCollections";
const META_COLLECTION = "taxonomyMeta";
const VERSION_DOCUMENT = "version";

function createServiceError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getVersionRef() {
  return db.collection(META_COLLECTION).doc(VERSION_DOCUMENT);
}

function getCollectionRef(collectionId) {
  return db
    .collection(COLLECTIONS)
    .doc(validateCollectionId(collectionId));
}

function incrementVersion(transaction, versionSnapshot) {
  const currentVersion = versionSnapshot.exists
    ? Number(versionSnapshot.data().version) || 0
    : 0;

  const version = currentVersion + 1;
  const updatedAt = Date.now();

  transaction.set(
    getVersionRef(),
    {
      version,
      updatedAt
    },
    { merge: true }
  );

  return { version, updatedAt };
}

async function mutateCollection(collectionId, mutate) {
  const collectionRef = getCollectionRef(collectionId);
  const versionRef = getVersionRef();

  return db.runTransaction(async (transaction) => {
    // Read operations first
    const collectionSnapshot = await transaction.get(collectionRef);
    const versionSnapshot = await transaction.get(versionRef);

    if (!collectionSnapshot.exists) {
      throw createServiceError("Collection not found", 404);
    }

    const currentCollection = {
      id: collectionSnapshot.id,
      ...collectionSnapshot.data()
    };

    const categories = Array.isArray(currentCollection.categories)
      ? [...currentCollection.categories]
      : [];

    const updatedCategories = mutate(categories);

    const updatedAt = Date.now();

    // Write operations
    transaction.update(collectionRef, {
      categories: updatedCategories,
      updatedAt
    });

    const metadata = incrementVersion(
      transaction,
      versionSnapshot
    );

    return {
      collectionId: collectionSnapshot.id,
      categories: updatedCategories,
      version: metadata.version,
      updatedAt: metadata.updatedAt
    };
  });
}

// ==============================
// CATEGORY OPERATIONS
// ==============================

export async function createCategory(collectionId, data) {
  const category = validateCategory(data);

  return mutateCollection(collectionId, (categories) => {
    const exists = categories.some(
      (item) => item.id === category.id
    );

    if (exists) {
      throw createServiceError(
        "Category ID already exists",
        409
      );
    }

    return [...categories, category];
  });
}

export async function updateCategory(
  collectionId,
  categoryId,
  data
) {
  const id = validateCategoryId(categoryId);

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw createServiceError("Category data must be an object");
  }

  return mutateCollection(collectionId, (categories) => {
    const index = categories.findIndex(
      (item) => item.id === id
    );

    if (index === -1) {
      throw createServiceError("Category not found", 404);
    }

    if (
      data.id !== undefined &&
      validateCategoryId(data.id) !== id
    ) {
      throw createServiceError(
        "Category ID cannot be changed"
      );
    }

    const updatedCategory = validateCategory(
      {
        ...categories[index],
        ...data,
        id
      }
    );

    const updatedCategories = [...categories];
    updatedCategories[index] = updatedCategory;

    return updatedCategories;
  });
}

export async function setCategoryActive(
  collectionId,
  categoryId,
  active
) {
  const id = validateCategoryId(categoryId);

  if (typeof active !== "boolean") {
    throw createServiceError("active must be a boolean");
  }

  return mutateCollection(collectionId, (categories) => {
    const index = categories.findIndex(
      (item) => item.id === id
    );

    if (index === -1) {
      throw createServiceError("Category not found", 404);
    }

    const updatedCategories = [...categories];

    updatedCategories[index] = {
      ...updatedCategories[index],
      active
    };

    return updatedCategories;
  });
}

// ==============================
// SUBCATEGORY OPERATIONS
// ==============================

export async function createSubcategory(
  collectionId,
  categoryId,
  data
) {
  const parentId = validateCategoryId(categoryId);
  const subcategory = validateSubcategory(data);

  return mutateCollection(collectionId, (categories) => {
    const categoryIndex = categories.findIndex(
      (item) => item.id === parentId
    );

    if (categoryIndex === -1) {
      throw createServiceError("Category not found", 404);
    }

    const category = categories[categoryIndex];

    const subcategories = Array.isArray(category.subcategories)
      ? [...category.subcategories]
      : [];

    const exists = subcategories.some(
      (item) => item.id === subcategory.id
    );

    if (exists) {
      throw createServiceError(
        "Subcategory ID already exists",
        409
      );
    }

    const updatedCategories = [...categories];

    updatedCategories[categoryIndex] = {
      ...category,
      subcategories: [...subcategories, subcategory]
    };

    return updatedCategories;
  });
}

export async function updateSubcategory(
  collectionId,
  categoryId,
  subcategoryId,
  data
) {
  const parentId = validateCategoryId(categoryId);
  const childId = validateSubcategoryId(subcategoryId);

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw createServiceError("Subcategory data must be an object");
  }

  return mutateCollection(collectionId, (categories) => {
    const categoryIndex = categories.findIndex(
      (item) => item.id === parentId
    );

    if (categoryIndex === -1) {
      throw createServiceError("Category not found", 404);
    }

    const category = categories[categoryIndex];

    const subcategories = Array.isArray(category.subcategories)
      ? [...category.subcategories]
      : [];

    const subcategoryIndex = subcategories.findIndex(
      (item) => item.id === childId
    );

    if (subcategoryIndex === -1) {
      throw createServiceError("Subcategory not found", 404);
    }

    if (
      data.id !== undefined &&
      validateSubcategoryId(data.id) !== childId
    ) {
      throw createServiceError(
        "Subcategory ID cannot be changed"
      );
    }

    const updatedSubcategory = validateSubcategory(
      {
        ...subcategories[subcategoryIndex],
        ...data,
        id: childId
      }
    );

    subcategories[subcategoryIndex] = updatedSubcategory;

    const updatedCategories = [...categories];

    updatedCategories[categoryIndex] = {
      ...category,
      subcategories
    };

    return updatedCategories;
  });
}

export async function setSubcategoryActive(
  collectionId,
  categoryId,
  subcategoryId,
  active
) {
  const parentId = validateCategoryId(categoryId);
  const childId = validateSubcategoryId(subcategoryId);

  if (typeof active !== "boolean") {
    throw createServiceError("active must be a boolean");
  }

  return mutateCollection(collectionId, (categories) => {
    const categoryIndex = categories.findIndex(
      (item) => item.id === parentId
    );

    if (categoryIndex === -1) {
      throw createServiceError("Category not found", 404);
    }

    const category = categories[categoryIndex];

    const subcategories = Array.isArray(category.subcategories)
      ? [...category.subcategories]
      : [];

    const subcategoryIndex = subcategories.findIndex(
      (item) => item.id === childId
    );

    if (subcategoryIndex === -1) {
      throw createServiceError("Subcategory not found", 404);
    }

    subcategories[subcategoryIndex] = {
      ...subcategories[subcategoryIndex],
      active
    };

    const updatedCategories = [...categories];

    updatedCategories[categoryIndex] = {
      ...category,
      subcategories
    };

    return updatedCategories;
  });
}
