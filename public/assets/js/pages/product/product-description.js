
'use strict';

// ========================================
// PRODUCT DESCRIPTION
// Description & Product Attributes
// ========================================

import {
  getProductElement,
  showProductMessage
} from './product-utils.js';


// ========================================
// STATE
// ========================================

let initialized = false;


// ========================================
// SELECTORS
// ========================================

const SELECTORS = {
  shortDescription: '#product-short-description',
  description: '#product-description',
  fabricType: '#product-fabric-type',
  fit: '#product-fit',
  sleeveType: '#product-sleeve-type',
  washCare: '#product-wash-care',
  tags: '#product-tags'
};


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    shortDescription: getProductElement(SELECTORS.shortDescription),
    description: getProductElement(SELECTORS.description),
    fabricType: getProductElement(SELECTORS.fabricType),
    fit: getProductElement(SELECTORS.fit),
    sleeveType: getProductElement(SELECTORS.sleeveType),
    washCare: getProductElement(SELECTORS.washCare),
    tags: getProductElement(SELECTORS.tags)
  };
}


// ========================================
// GET FIELD VALUE
// ========================================

function getValue(element) {
  return element?.value?.trim() || '';
}


// ========================================
// SET FIELD VALUE
// ========================================

function setValue(element, value) {
  if (!element) return;

  element.value = value ?? '';
}


// ========================================
// NORMALIZE TAGS
// ========================================

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(
      value
        .map(tag => String(tag).trim())
        .filter(Boolean)
    )];
  }

  if (typeof value === 'string') {
    return [...new Set(
      value
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
    )];
  }

  return [];
}


// ========================================
// GET DESCRIPTION DATA
// ========================================

export function getProductDescriptionData() {
  const elements = getElements();

  return {
    shortDescription: getValue(elements.shortDescription),

    description: getValue(elements.description),

    fabricType: getValue(elements.fabricType),

    fit: getValue(elements.fit),

    sleeveType: getValue(elements.sleeveType),

    washCare: getValue(elements.washCare),

    tags: normalizeTags(getValue(elements.tags))
  };
}


// ========================================
// SET DESCRIPTION DATA
// EDIT PRODUCT / AI GENERATED DATA
// ========================================

export function setProductDescriptionData(data = {}) {
  const elements = getElements();

  setValue(
    elements.shortDescription,
    data.shortDescription
  );

  setValue(
    elements.description,
    data.description
  );

  setValue(
    elements.fabricType,
    data.fabricType
  );

  setValue(
    elements.fit,
    data.fit
  );

  setValue(
    elements.sleeveType,
    data.sleeveType
  );

  setValue(
    elements.washCare,
    data.washCare
  );

  setValue(
    elements.tags,
    normalizeTags(data.tags).join(', ')
  );
}


// ========================================
// VALIDATE DESCRIPTION
// ========================================

export function validateProductDescription() {
  const elements = getElements();

  if (
    !elements.shortDescription ||
    !elements.description
  ) {
    showProductMessage(
      'Description form elements পাওয়া যায়নি।',
      'error'
    );

    return false;
  }

  const shortDescription = getValue(
    elements.shortDescription
  );

  const description = getValue(
    elements.description
  );

  if (shortDescription.length > 300) {
    showProductMessage(
      'Short Description সর্বোচ্চ 300 অক্ষর হতে পারবে।',
      'warning'
    );

    elements.shortDescription.focus();

    return false;
  }

  if (description.length > 10000) {
    showProductMessage(
      'Description সর্বোচ্চ 10000 অক্ষর হতে পারবে।',
      'warning'
    );

    elements.description.focus();

    return false;
  }

  return true;
}


// ========================================
// RESET DESCRIPTION
// ========================================

export function resetProductDescription() {
  const elements = getElements();

  Object.values(elements).forEach(element => {
    if (element) element.value = '';
  });
}


// ========================================
// CHARACTER COUNTER
// ========================================

function updateCharacterCounter(element, counter, maxLength) {
  if (!element || !counter) return;

  counter.textContent =
    `${element.value.length} / ${maxLength}`;
}


// ========================================
// BIND EVENTS
// ========================================

function bindDescriptionEvents() {
  const elements = getElements();

  const shortCounter = getProductElement(
    '#product-short-description-counter'
  );

  const descriptionCounter = getProductElement(
    '#product-description-counter'
  );

  elements.shortDescription?.addEventListener(
    'input',
    () => {
      updateCharacterCounter(
        elements.shortDescription,
        shortCounter,
        300
      );
    }
  );

  elements.description?.addEventListener(
    'input',
    () => {
      updateCharacterCounter(
        elements.description,
        descriptionCounter,
        10000
      );
    }
  );
}


// ========================================
// INITIALIZE
// ========================================

export function initProductDescription() {
  if (initialized) return;

  const elements = getElements();

  if (!elements.shortDescription || !elements.description) {
    console.warn(
      '[PRODUCT DESCRIPTION] Required elements not found.'
    );

    return;
  }

  bindDescriptionEvents();

  updateCharacterCounter(
    elements.shortDescription,
    getProductElement('#product-short-description-counter'),
    300
  );

  updateCharacterCounter(
    elements.description,
    getProductElement('#product-description-counter'),
    10000
  );

  initialized = true;
}


// ========================================
// DEFAULT EXPORT
// ========================================

export default initProductDescription;
