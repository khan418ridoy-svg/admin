
'use strict';

// ========================================
// PRODUCT FLAGS
// Featured, New Arrival & Best Seller
// ========================================

import {
  getProductElement,
  showProductMessage
} from './product-utils.js';

let initialized = false;

const SELECTORS = {
  isNewArrival: '#product-is-new-arrival',
  isFeatured: '#product-is-featured',
  isBestSeller: '#product-is-best-seller'
};


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    isNewArrival: getProductElement(SELECTORS.isNewArrival),
    isFeatured: getProductElement(SELECTORS.isFeatured),
    isBestSeller: getProductElement(SELECTORS.isBestSeller)
  };
}


// ========================================
// GET FLAGS DATA
// ========================================

export function getProductFlagsData() {
  const elements = getElements();

  return {
    isNewArrival: elements.isNewArrival?.checked === true,
    isFeatured: elements.isFeatured?.checked === true,
    isBestSeller: elements.isBestSeller?.checked === true
  };
}


// ========================================
// SET FLAGS DATA
// ========================================

export function setProductFlagsData(data = {}) {
  const elements = getElements();

  if (elements.isNewArrival) {
    elements.isNewArrival.checked =
      data.isNewArrival === true;
  }

  if (elements.isFeatured) {
    elements.isFeatured.checked =
      data.isFeatured === true;
  }

  if (elements.isBestSeller) {
    elements.isBestSeller.checked =
      data.isBestSeller === true;
  }
}


// ========================================
// VALIDATE FLAGS
// ========================================

export function validateProductFlags() {
  const elements = getElements();

  if (
    !elements.isNewArrival ||
    !elements.isFeatured ||
    !elements.isBestSeller
  ) {
    showProductMessage(
      'Product Flags form elements পাওয়া যায়নি।',
      'error'
    );

    return false;
  }

  return true;
}


// ========================================
// RESET FLAGS
// ========================================

export function resetProductFlags() {
  const elements = getElements();

  if (elements.isNewArrival) {
    elements.isNewArrival.checked = false;
  }

  if (elements.isFeatured) {
    elements.isFeatured.checked = false;
  }

  if (elements.isBestSeller) {
    elements.isBestSeller.checked = false;
  }
}


// ========================================
// INITIALIZE
// ========================================

export function initProductFlags() {
  if (initialized) return;

  const elements = getElements();

  if (
    !elements.isNewArrival ||
    !elements.isFeatured ||
    !elements.isBestSeller
  ) {
    console.warn('[PRODUCT FLAGS] Required elements not found.');
    return;
  }

  initialized = true;
}

export default initProductFlags;
