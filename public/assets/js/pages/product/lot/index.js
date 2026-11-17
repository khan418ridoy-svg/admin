
'use strict';

// ========================================
// PRODUCT LOT SYSTEM
// MAIN ENTRY POINT
// ========================================


// ========================================
// PRODUCT LOTS
// ========================================

import {
  initProductLots,
  loadProductLots,
  refreshProductLots,
  resetProductLots,
  renderProductLots,
  setProductLots,
  getProductLots
} from './product-lots.js';


// ========================================
// LOT CREATE
// ========================================

import {
  initLotCreate,
  setLotCreateProductId,
  getLotCreateProductId,
  openLotCreate,
  closeLotCreate,
  getLotCreateData,
  validateLotCreate,
  createProductLot,
  resetLotCreate
} from './lot-create.js';


// ========================================
// LOT VARIANTS
// ========================================

import {
  initLotVariants,
  renderLotVariants,
  addLotVariant,
  removeLotVariant,
  getLotVariantsData,
  setLotVariantsData,
  validateLotVariants,
  getLotTotalQuantity,
  resetLotVariants
} from './lot-variants.js';


// ========================================
// LOT COST
// ========================================

import {
  initLotCost,
  getLotCostData,
  setLotCostData,
  validateLotCost,
  getLotTotalCost,
  updateLotCostSummary,
  resetLotCost
} from './lot-cost.js';


// ========================================
// LOT HISTORY
// ========================================

import {
  initLotHistory,
  loadLotHistory,
  openLotHistory,
  closeLotHistory,
  refreshLotHistory,
  resetLotHistory,
  renderLotHistory,
  setLotHistory,
  getLotHistory
} from './lot-history.js';


// ========================================
// MODULE STATE
// ========================================

let initialized = false;
let currentProductId = '';


// ========================================
// INITIALIZE ALL MODULES
// ========================================

export function initProductLotPage() {
  if (initialized) return;

  // Purchase Lot List
  initProductLots();

  // Lot Variants
  initLotVariants();

  // Lot Cost
  initLotCost();

  // Lot History
  initLotHistory();

  // Lot Create
  initLotCreate();

  initialized = true;

  console.info('[PRODUCT LOT] Initialized.');
}


// ========================================
// LOAD PRODUCT LOT PAGE
// ========================================

export async function loadProductLotPage(productId) {
  if (!productId) {
    console.warn(
      '[PRODUCT LOT] Product ID is required.'
    );

    return false;
  }

  initProductLotPage();

  currentProductId = String(productId);

  // Set Product ID for Lot Create Module
  setLotCreateProductId(currentProductId);

  // Load Purchase Lots
  return await loadProductLots(currentProductId);
}


// ========================================
// REFRESH PRODUCT LOT PAGE
// ========================================

export async function refreshProductLotPage() {
  if (!currentProductId) {
    return false;
  }

  return await refreshProductLots();
}


// ========================================
// GET CURRENT PRODUCT ID
// ========================================

export function getCurrentLotProductId() {
  return currentProductId;
}


// ========================================
// LOT CREATE ACTIONS
// ========================================

export {
  openLotCreate,
  closeLotCreate,
  getLotCreateData,
  validateLotCreate,
  createProductLot,
  resetLotCreate,
  getLotCreateProductId
};


// ========================================
// LOT VARIANT ACTIONS
// ========================================

export {
  renderLotVariants,
  addLotVariant,
  removeLotVariant,
  getLotVariantsData,
  setLotVariantsData,
  validateLotVariants,
  getLotTotalQuantity,
  resetLotVariants
};


// ========================================
// LOT COST ACTIONS
// ========================================

export {
  getLotCostData,
  setLotCostData,
  validateLotCost,
  getLotTotalCost,
  updateLotCostSummary,
  resetLotCost
};


// ========================================
// LOT HISTORY ACTIONS
// ========================================

export {
  loadLotHistory,
  openLotHistory,
  closeLotHistory,
  refreshLotHistory,
  resetLotHistory,
  renderLotHistory,
  setLotHistory,
  getLotHistory
};


// ========================================
// LOT LIST ACTIONS
// ========================================

export {
  loadProductLots,
  refreshProductLots,
  renderProductLots,
  setProductLots,
  getProductLots,
  resetProductLots
};


// ========================================
// RESET PRODUCT LOT PAGE
// ========================================

export function resetProductLotPage() {
  resetProductLots();

  resetLotCreate();

  resetLotVariants();

  resetLotCost();

  resetLotHistory();

  currentProductId = '';
}


// ========================================
// DEFAULT EXPORT
// ========================================

export default {
  initProductLotPage,
  loadProductLotPage,
  refreshProductLotPage,
  getCurrentLotProductId,
  resetProductLotPage
};
