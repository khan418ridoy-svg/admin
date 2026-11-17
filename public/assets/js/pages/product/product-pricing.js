
'use strict';

// ========================================
// PRODUCT PRICING
// Regular Price, Selling Price & Discount
// ========================================

import {
  getProductElement,
  showProductMessage
} from './product-utils.js';


// ========================================
// SELECTORS
// ========================================

const SELECTORS = {
  regularPrice: '#product-regular-price',
  sellingPrice: '#product-selling-price',
  discountPercent: '#product-discount-percent'
};


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    regularPrice: getProductElement(SELECTORS.regularPrice),
    sellingPrice: getProductElement(SELECTORS.sellingPrice),
    discountPercent: getProductElement(SELECTORS.discountPercent)
  };
}


// ========================================
// FORMAT PRICE
// ========================================

export function formatProductPrice(value) {
  const price = Number(value);

  if (!Number.isFinite(price)) return '0';

  return price.toLocaleString('en-IN', {
    maximumFractionDigits: 2
  });
}


// ========================================
// GET NUMERIC VALUE
// ========================================

function getNumericValue(element) {
  if (!element) return 0;

  const value = Number(element.value);

  return Number.isFinite(value) ? value : 0;
}


// ========================================
// CALCULATE DISCOUNT
// ========================================

export function calculateProductDiscount(regularPrice, sellingPrice) {
  const regular = Number(regularPrice);
  const selling = Number(sellingPrice);

  if (
    !Number.isFinite(regular) ||
    !Number.isFinite(selling) ||
    regular <= 0 ||
    selling < 0 ||
    selling > regular
  ) {
    return 0;
  }

  return Number(
    (((regular - selling) / regular) * 100).toFixed(2)
  );
}


// ========================================
// UPDATE DISCOUNT
// ========================================

function updateDiscount() {
  const {
    regularPrice,
    sellingPrice,
    discountPercent
  } = getElements();

  if (!regularPrice || !sellingPrice || !discountPercent) {
    return;
  }

  const regular = getNumericValue(regularPrice);
  const selling = getNumericValue(sellingPrice);

  const discount = calculateProductDiscount(
    regular,
    selling
  );

  discountPercent.value = discount;
}


// ========================================
// VALIDATE PRICING
// ========================================

export function validateProductPricing() {
  const {
    regularPrice,
    sellingPrice
  } = getElements();

  if (!regularPrice || !sellingPrice) {
    showProductMessage(
      'Pricing form elements পাওয়া যায়নি।',
      'error'
    );

    return false;
  }

  const regular = getNumericValue(regularPrice);
  const selling = getNumericValue(sellingPrice);

  if (regular <= 0) {
    showProductMessage(
      'Regular Price সঠিকভাবে লিখুন।',
      'warning'
    );

    regularPrice.focus();
    return false;
  }

  if (selling <= 0) {
    showProductMessage(
      'Selling Price সঠিকভাবে লিখুন।',
      'warning'
    );

    sellingPrice.focus();
    return false;
  }

  if (selling > regular) {
    showProductMessage(
      'Selling Price কখনো Regular Price-এর বেশি হতে পারবে না।',
      'warning'
    );

    sellingPrice.focus();
    return false;
  }

  return true;
}


// ========================================
// GET PRICING DATA
// ========================================

export function getProductPricingData() {
  const {
    regularPrice,
    sellingPrice
  } = getElements();

  const regular = getNumericValue(regularPrice);
  const selling = getNumericValue(sellingPrice);

  return {
    regularPrice: regular,
    sellingPrice: selling,
    discountPercent: calculateProductDiscount(
      regular,
      selling
    )
  };
}


// ========================================
// SET PRICING DATA
// ========================================

export function setProductPricingData(data = {}) {
  const {
    regularPrice,
    sellingPrice
  } = getElements();

  if (!regularPrice || !sellingPrice) return;

  regularPrice.value = data.regularPrice ?? '';
  sellingPrice.value = data.sellingPrice ?? '';

  updateDiscount();
}


// ========================================
// RESET PRICING
// ========================================

export function resetProductPricing() {
  const {
    regularPrice,
    sellingPrice,
    discountPercent
  } = getElements();

  if (regularPrice) regularPrice.value = '';
  if (sellingPrice) sellingPrice.value = '';
  if (discountPercent) discountPercent.value = '';
}


// ========================================
// EVENT BINDING
// ========================================

function bindPricingEvents() {
  const {
    regularPrice,
    sellingPrice
  } = getElements();

  regularPrice?.addEventListener('input', updateDiscount);
  sellingPrice?.addEventListener('input', updateDiscount);
}


// ========================================
// INITIALIZE
// ========================================

let initialized = false;

export function initProductPricing() {
  if (initialized) return;

  const {
    regularPrice,
    sellingPrice,
    discountPercent
  } = getElements();

  if (!regularPrice || !sellingPrice || !discountPercent) {
    console.warn(
      '[PRODUCT PRICING] Required pricing elements not found.'
    );

    return;
  }

  regularPrice.type = 'number';
  sellingPrice.type = 'number';

  regularPrice.min = '0';
  sellingPrice.min = '0';

  regularPrice.step = '0.01';
  sellingPrice.step = '0.01';

  discountPercent.readOnly = true;

  bindPricingEvents();

  initialized = true;
}
