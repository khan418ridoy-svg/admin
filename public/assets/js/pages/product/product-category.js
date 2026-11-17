
'use strict';

// ========================================
// PRODUCT CATEGORY
// Collection, Category & Subcategory
// ========================================

import {
  getProductElement,
  showProductMessage
} from './product-utils.js';


// ========================================
// STATE
// ========================================

let taxonomyData = null;
let initialized = false;


// ========================================
// SELECTORS
// ========================================

const SELECTORS = {
  collection: '#product-collection',
  category: '#product-category',
  subCategory: '#product-subcategory'
};


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    collection: getProductElement(SELECTORS.collection),
    category: getProductElement(SELECTORS.category),
    subCategory: getProductElement(SELECTORS.subCategory)
  };
}


// ========================================
// GET TAXONOMY FROM BACKEND
// ========================================

async function fetchTaxonomy() {
  const response = await fetch('/api/taxonomy', {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Taxonomy load failed: ${response.status}`);
  }

  const result = await response.json();

  if (result.success === false) {
    throw new Error(result.message || 'Taxonomy load failed');
  }

  const data = result.data ?? result.taxonomy ?? result;

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid taxonomy response');
  }

  taxonomyData = data;

  return taxonomyData;
}


// ========================================
// NORMALIZE TAXONOMY
// ========================================

function getCollections() {
  if (!taxonomyData) return [];

  const collections = taxonomyData.collections;

  if (Array.isArray(collections)) {
    return collections;
  }

  if (collections && typeof collections === 'object') {
    return Object.entries(collections).map(([id, item]) => ({
      id,
      ...item
    }));
  }

  return [];
}


function getCategories(collectionId) {
  if (!taxonomyData) return [];

  const categories = taxonomyData.categories;

  if (Array.isArray(categories)) {
    return categories.filter(item =>
      !item.collectionId ||
      item.collectionId === collectionId
    );
  }

  if (categories && typeof categories === 'object') {
    return Object.entries(categories)
      .map(([id, item]) => ({
        id,
        ...item
      }))
      .filter(item =>
        !item.collectionId ||
        item.collectionId === collectionId
      );
  }

  return [];
}


function getSubCategories(categoryId) {
  if (!taxonomyData) return [];

  const subCategories = taxonomyData.subcategories ??
    taxonomyData.subCategories;

  if (Array.isArray(subCategories)) {
    return subCategories.filter(item =>
      item.categoryId === categoryId
    );
  }

  if (subCategories && typeof subCategories === 'object') {
    return Object.entries(subCategories)
      .map(([id, item]) => ({
        id,
        ...item
      }))
      .filter(item =>
        item.categoryId === categoryId
      );
  }

  return [];
}


// ========================================
// GET ITEM ID & NAME
// ========================================

function getItemId(item) {
  return String(item.id ?? item.collectionId ??
    item.categoryId ?? item.subCategoryId ?? '');
}


function getItemName(item) {
  return String(item.name ?? item.title ?? '');
}


// ========================================
// RENDER SELECT OPTIONS
// ========================================

function renderOptions(select, items, placeholder, selectedId = '') {
  if (!select) return;

  select.replaceChildren();

  const defaultOption = document.createElement('option');

  defaultOption.value = '';
  defaultOption.textContent = placeholder;

  select.appendChild(defaultOption);

  items.forEach(item => {
    const id = getItemId(item);
    const name = getItemName(item);

    if (!id || !name || item.isActive === false) return;

    const option = document.createElement('option');

    option.value = id;
    option.textContent = name;

    if (id === String(selectedId)) {
      option.selected = true;
    }

    select.appendChild(option);
  });

  select.disabled = items.length === 0;
}


// ========================================
// LOAD COLLECTIONS
// ========================================

function loadCollections(selectedId = '') {
  const { collection } = getElements();

  if (!collection) return;

  renderOptions(
    collection,
    getCollections(),
    'Select Collection',
    selectedId
  );
}


// ========================================
// LOAD CATEGORIES
// ========================================

function loadCategories(selectedId = '') {
  const { collection, category } = getElements();

  if (!category) return;

  const collectionId = collection?.value || '';

  renderOptions(
    category,
    collectionId ? getCategories(collectionId) : [],
    'Select Category',
    selectedId
  );

  loadSubCategories();
}


// ========================================
// LOAD SUBCATEGORIES
// ========================================

function loadSubCategories(selectedId = '') {
  const { category, subCategory } = getElements();

  if (!subCategory) return;

  const categoryId = category?.value || '';

  renderOptions(
    subCategory,
    categoryId ? getSubCategories(categoryId) : [],
    'Select Subcategory',
    selectedId
  );
}


// ========================================
// COLLECTION CHANGE
// ========================================

function handleCollectionChange() {
  const { category, subCategory } = getElements();

  if (category) category.value = '';
  if (subCategory) subCategory.value = '';

  loadCategories();
}


// ========================================
// CATEGORY CHANGE
// ========================================

function handleCategoryChange() {
  const { subCategory } = getElements();

  if (subCategory) subCategory.value = '';

  loadSubCategories();
}


// ========================================
// VALIDATE CATEGORY
// ========================================

export function validateProductCategory() {
  const { collection, category, subCategory } = getElements();

  if (!collection || !category || !subCategory) {
    showProductMessage(
      'Category form elements পাওয়া যায়নি।',
      'error'
    );

    return false;
  }

  if (!collection.value) {
    showProductMessage('Collection নির্বাচন করুন।', 'warning');
    collection.focus();
    return false;
  }

  if (!category.value) {
    showProductMessage('Category নির্বাচন করুন।', 'warning');
    category.focus();
    return false;
  }

  return true;
}


// ========================================
// GET CATEGORY DATA
// ========================================

export function getProductCategoryData() {
  const { collection, category, subCategory } = getElements();

  return {
    collectionId: collection?.value || '',
    categoryId: category?.value || '',
    subCategoryId: subCategory?.value || ''
  };
}


// ========================================
// SET CATEGORY DATA (EDIT PRODUCT)
// ========================================

export function setProductCategoryData(data = {}) {
  const { collection, category, subCategory } = getElements();

  if (!collection || !category || !subCategory) return;

  collection.value = data.collectionId || '';

  loadCategories(data.categoryId || '');

  category.value = data.categoryId || '';

  loadSubCategories(data.subCategoryId || '');

  subCategory.value = data.subCategoryId || '';
}


// ========================================
// INITIALIZE
// ========================================

export async function initProductCategory() {
  if (initialized) return;

  const elements = getElements();

  if (!elements.collection ||
      !elements.category ||
      !elements.subCategory) {
    console.warn(
      '[PRODUCT CATEGORY] Required select elements not found.'
    );
    return;
  }

  try {
    await fetchTaxonomy();

    loadCollections();

    elements.collection.addEventListener(
      'change',
      handleCollectionChange
    );

    elements.category.addEventListener(
      'change',
      handleCategoryChange
    );

    initialized = true;

  } catch (error) {
    console.error('[PRODUCT CATEGORY]', error);

    showProductMessage(
      'Collection ও Category load করা যায়নি।',
      'error'
    );
  }
}


// ========================================
// REFRESH TAXONOMY
// ========================================

export async function refreshProductTaxonomy() {
  try {
    await fetchTaxonomy();
    loadCollections();

    return true;

  } catch (error) {
    console.error('[PRODUCT CATEGORY] Refresh failed:', error);

    showProductMessage(
      'Taxonomy refresh করা যায়নি।',
      'error'
    );

    return false;
  }
}
