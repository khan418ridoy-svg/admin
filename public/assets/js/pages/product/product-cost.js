
'use strict';

// ========================================
// PRODUCT COST
// Private Purchase Cost Management
// ========================================

import {
  getProductElement,
  showProductMessage
} from './product-utils.js';

let initialized = false;

let currentProductId = null;

const SELECTORS = {
  buyPrice: '#product-buy-price',
  supplier: '#product-supplier',
  purchaseNote: '#product-purchase-note',
  container: '#product-cost-container'
};


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    buyPrice: getProductElement(SELECTORS.buyPrice),
    supplier: getProductElement(SELECTORS.supplier),
    purchaseNote: getProductElement(SELECTORS.purchaseNote),
    container: getProductElement(SELECTORS.container)
  };
}


// ========================================
// GET COST DATA
// ========================================

export function getProductCostData() {
  const elements = getElements();

  return {
    buyPrice: Number(elements.buyPrice?.value || 0),
    supplier: elements.supplier?.value.trim() || '',
    purchaseNote: elements.purchaseNote?.value.trim() || ''
  };
}


// ========================================
// SET COST DATA
// ========================================

export function setProductCostData(data = {}) {
  const elements = getElements();

  if (elements.buyPrice) {
    elements.buyPrice.value = data.buyPrice ?? '';
  }

  if (elements.supplier) {
    elements.supplier.value = data.supplier || '';
  }

  if (elements.purchaseNote) {
    elements.purchaseNote.value = data.purchaseNote || '';
  }
}


// ========================================
// VALIDATE COST
// ========================================

export function validateProductCost() {
  const elements = getElements();

  const buyPrice = Number(elements.buyPrice?.value || 0);

  if (
    !Number.isFinite(buyPrice) ||
    buyPrice < 0
  ) {
    showProductMessage(
      'Purchase Cost সঠিকভাবে লিখুন।',
      'warning'
    );

    elements.buyPrice?.focus();
    return false;
  }

  return true;
}


// ========================================
// LOAD PRIVATE COST
// ========================================

export async function loadProductCost(productId) {
  if (!productId) return false;

  try {
    const response = await fetch(
      `/api/products/${encodeURIComponent(productId)}/costs`,
      {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Cost load failed: ${response.status}`);
    }

    const result = await response.json();

    if (result.success === false) {
      throw new Error(result.message || 'Cost load failed');
    }

    setProductCostData(result.data || {});

    currentProductId = productId;

    return true;

  } catch (error) {
    console.error('[PRODUCT COST]', error);

    showProductMessage(
      'Private Product Cost load করা যায়নি।',
      'error'
    );

    return false;
  }
}


// ========================================
// SAVE PRIVATE COST
// ========================================

export async function saveProductCost(productId) {
  if (!productId) {
    showProductMessage(
      'Product ID পাওয়া যায়নি।',
      'error'
    );

    return false;
  }

  if (!validateProductCost()) return false;

  try {
    const response = await fetch(
      `/api/products/${encodeURIComponent(productId)}/costs`,
      {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(getProductCostData())
      }
    );

    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || 'Product Cost save failed'
      );
    }

    currentProductId = productId;

    showProductMessage(
      'Private Cost সফলভাবে Save হয়েছে।',
      'success'
    );

    return true;

  } catch (error) {
    console.error('[PRODUCT COST]', error);

    showProductMessage(
      error.message || 'Private Cost Save করা যায়নি।',
      'error'
    );

    return false;
  }
}


// ========================================
// RESET COST
// ========================================

export function resetProductCost() {
  const elements = getElements();

  if (elements.buyPrice) elements.buyPrice.value = '';
  if (elements.supplier) elements.supplier.value = '';
  if (elements.purchaseNote) {
    elements.purchaseNote.value = '';
  }

  currentProductId = null;
}


// ========================================
// INITIALIZE
// ========================================

export function initProductCost() {
  if (initialized) return;

  const elements = getElements();

  if (!elements.container) {
    console.warn('[PRODUCT COST] Container not found.');
    return;
  }

  initialized = true;
}

export default initProductCost;
