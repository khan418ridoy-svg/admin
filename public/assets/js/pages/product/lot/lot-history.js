
'use strict';

// ========================================
// LOT COST
// Purchase Cost & Additional Expenses
// ========================================

import {
  getProductElement,
  showProductMessage,
  getProductNumber
} from '../product-utils.js';


// ========================================
// CONFIGURATION
// ========================================

const SELECTORS = {
  purchaseCost: '#lot-purchase-cost',
  transportCost: '#lot-transport-cost',
  packagingCost: '#lot-packaging-cost',
  otherCost: '#lot-other-cost',
  otherCostNote: '#lot-other-cost-note',

  totalCost: '#lot-total-cost',
  totalQuantity: '#lot-cost-total-quantity',
  unitCost: '#lot-unit-cost'
};


// ========================================
// MODULE STATE
// ========================================

let initialized = false;

let costData = {
  purchaseCost: 0,
  transportCost: 0,
  packagingCost: 0,
  otherCost: 0,
  otherCostNote: ''
};


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    purchaseCost: getProductElement(SELECTORS.purchaseCost),
    transportCost: getProductElement(SELECTORS.transportCost),
    packagingCost: getProductElement(SELECTORS.packagingCost),
    otherCost: getProductElement(SELECTORS.otherCost),
    otherCostNote: getProductElement(SELECTORS.otherCostNote),

    totalCost: getProductElement(SELECTORS.totalCost),
    totalQuantity: getProductElement(SELECTORS.totalQuantity),
    unitCost: getProductElement(SELECTORS.unitCost)
  };
}


// ========================================
// READ INPUT
// ========================================

function readInput(input) {
  if (!input) return 0;

  return getProductNumber(input.value, 0);
}


// ========================================
// COLLECT COST DATA
// ========================================

function collectCostData() {
  const elements = getElements();

  costData = {
    purchaseCost: readInput(elements.purchaseCost),
    transportCost: readInput(elements.transportCost),
    packagingCost: readInput(elements.packagingCost),
    otherCost: readInput(elements.otherCost),

    otherCostNote:
      elements.otherCostNote?.value.trim() || ''
  };

  return { ...costData };
}


// ========================================
// TOTAL COST
// ========================================

export function getLotTotalCost() {
  const data = collectCostData();

  return (
    data.purchaseCost +
    data.transportCost +
    data.packagingCost +
    data.otherCost
  );
}


// ========================================
// TOTAL QUANTITY
// ========================================

function getCurrentTotalQuantity() {
  const elements = getElements();

  // Prefer the Lot Variants module's live total.
  const displayedQuantity = Number(
    elements.totalQuantity?.textContent || 0
  );

  return Number.isFinite(displayedQuantity)
    ? displayedQuantity
    : 0;
}


// ========================================
// FORMAT MONEY
// ========================================

function formatMoney(value) {
  return new Intl.NumberFormat('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}


// ========================================
// UPDATE COST SUMMARY
// ========================================

export function updateLotCostSummary() {
  const elements = getElements();

  const data = collectCostData();

  const totalCost =
    data.purchaseCost +
    data.transportCost +
    data.packagingCost +
    data.otherCost;

  const quantity = getCurrentTotalQuantity();

  const unitCost = quantity > 0
    ? totalCost / quantity
    : 0;

  if (elements.totalCost) {
    elements.totalCost.textContent =
      `৳ ${formatMoney(totalCost)}`;
  }

  if (elements.unitCost) {
    elements.unitCost.textContent =
      `৳ ${formatMoney(unitCost)}`;
  }

  return {
    totalCost,
    totalQuantity: quantity,
    unitCost
  };
}


// ========================================
// GET COST DATA
// ========================================

export function getLotCostData() {
  return collectCostData();
}


// ========================================
// SET COST DATA
// ========================================

export function setLotCostData(data = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    showProductMessage(
      'Lot Cost Data সঠিক নয়।',
      'error'
    );

    return false;
  }

  const elements = getElements();

  const fields = {
    purchaseCost: elements.purchaseCost,
    transportCost: elements.transportCost,
    packagingCost: elements.packagingCost,
    otherCost: elements.otherCost
  };

  for (const [key, input] of Object.entries(fields)) {
    if (input) {
      input.value = String(
        getProductNumber(data[key], 0)
      );
    }
  }

  if (elements.otherCostNote) {
    elements.otherCostNote.value =
      String(data.otherCostNote || '');
  }

  costData = {
    purchaseCost: getProductNumber(data.purchaseCost, 0),
    transportCost: getProductNumber(data.transportCost, 0),
    packagingCost: getProductNumber(data.packagingCost, 0),
    otherCost: getProductNumber(data.otherCost, 0),
    otherCostNote: String(data.otherCostNote || '')
  };

  updateLotCostSummary();

  return true;
}


// ========================================
// VALIDATE COST DATA
// ========================================

export function validateLotCost() {
  const data = collectCostData();

  const costFields = [
    ['Purchase Cost', data.purchaseCost],
    ['Transport Cost', data.transportCost],
    ['Packaging Cost', data.packagingCost],
    ['Other Cost', data.otherCost]
  ];

  for (const [label, value] of costFields) {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      showProductMessage(
        `${label} সঠিকভাবে লিখুন।`,
        'warning'
      );

      return false;
    }
  }

  if (
    !Number.isFinite(getLotTotalCost()) ||
    getLotTotalCost() <= 0
  ) {
    showProductMessage(
      'Lot-এর মোট Cost অবশ্যই ০-এর বেশি হতে হবে।',
      'warning'
    );

    return false;
  }

  return true;
}


// ========================================
// RESET COST
// ========================================

export function resetLotCost() {
  const elements = getElements();

  Object.values({
    purchaseCost: elements.purchaseCost,
    transportCost: elements.transportCost,
    packagingCost: elements.packagingCost,
    otherCost: elements.otherCost,
    otherCostNote: elements.otherCostNote
  }).forEach(input => {
    if (input) input.value = '';
  });

  costData = {
    purchaseCost: 0,
    transportCost: 0,
    packagingCost: 0,
    otherCost: 0,
    otherCostNote: ''
  };

  updateLotCostSummary();
}


// ========================================
// BIND EVENTS
// ========================================

function bindEvents() {
  const elements = getElements();

  const costInputs = [
    elements.purchaseCost,
    elements.transportCost,
    elements.packagingCost,
    elements.otherCost
  ];

  costInputs.forEach(input => {
    input?.addEventListener('input', () => {
      updateLotCostSummary();
    });
  });

  elements.otherCostNote?.addEventListener(
    'input',
    () => {
      collectCostData();
    }
  );

  document.addEventListener(
    'product:lot-quantity-changed',
    () => {
      updateLotCostSummary();
    }
  );
}


// ========================================
// INITIALIZE
// ========================================

export function initLotCost() {
  if (initialized) return;

  const elements = getElements();

  if (!elements.purchaseCost) {
    console.warn(
      '[LOT COST] Purchase cost input not found.'
    );

    return;
  }

  bindEvents();

  initialized = true;

  updateLotCostSummary();
}


export default initLotCost;
