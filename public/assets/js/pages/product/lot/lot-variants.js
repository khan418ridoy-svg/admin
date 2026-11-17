
'use strict';

// ========================================
// LOT VARIANTS
// Color, Size & Purchase Quantity
// ========================================

import {
  getProductElement,
  showProductMessage,
  escapeProductHTML
} from '../product-utils.js';


// ========================================
// CONFIGURATION
// ========================================

const SELECTORS = {
  container: '#lot-variants-container',
  addButton: '#lot-add-variant',
  totalQuantity: '#lot-total-quantity',
  template: '#lot-variant-template'
};

const MAX_VARIANTS = 100;


// ========================================
// MODULE STATE
// ========================================

let initialized = false;
let variants = [];
let variantCounter = 0;


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    container: getProductElement(SELECTORS.container),
    addButton: getProductElement(SELECTORS.addButton),
    totalQuantity: getProductElement(SELECTORS.totalQuantity),
    template: getProductElement(SELECTORS.template)
  };
}


// ========================================
// CREATE VARIANT OBJECT
// ========================================

function createVariant(data = {}) {
  variantCounter++;

  return {
    localId: String(data.localId || `lot-variant-${variantCounter}`),
    color: String(data.color || ''),
    size: String(data.size || ''),
    quantity: Number(data.quantity || 0),
    note: String(data.note || '')
  };
}


// ========================================
// GET TOTAL QUANTITY
// ========================================

export function getLotTotalQuantity() {
  return variants.reduce((total, variant) => {
    return total + Math.max(0, Number(variant.quantity) || 0);
  }, 0);
}


// ========================================
// UPDATE TOTAL QUANTITY
// ========================================

function updateTotalQuantity() {
  const elements = getElements();

  if (elements.totalQuantity) {
    elements.totalQuantity.textContent =
      String(getLotTotalQuantity());
  }

  document.dispatchEvent(
    new CustomEvent('product:lot-quantity-changed', {
      detail: {
        totalQuantity: getLotTotalQuantity()
      }
    })
  );
}


// ========================================
// CREATE VARIANT ROW
// ========================================

function createVariantRow(variant) {
  const row = document.createElement('div');

  row.className = 'lot-variant-row';
  row.dataset.variantId = variant.localId;

  row.innerHTML = `
    <div class="form-group">
      <label>Color</label>

      <input
        type="text"
        class="lot-variant-color"
        value="${escapeProductHTML(variant.color)}"
        maxlength="50"
        placeholder="Black"
        required
      >
    </div>

    <div class="form-group">
      <label>Size</label>

      <input
        type="text"
        class="lot-variant-size"
        value="${escapeProductHTML(variant.size)}"
        maxlength="30"
        placeholder="M"
        required
      >
    </div>

    <div class="form-group">
      <label>Purchase Quantity</label>

      <input
        type="number"
        class="lot-variant-quantity"
        value="${variant.quantity || ''}"
        min="1"
        step="1"
        placeholder="0"
        required
      >
    </div>

    <div class="form-group">
      <label>Note (Optional)</label>

      <input
        type="text"
        class="lot-variant-note"
        value="${escapeProductHTML(variant.note)}"
        maxlength="200"
        placeholder="Optional note"
      >
    </div>

    <button
      type="button"
      class="lot-variant-remove"
      data-action="remove-variant"
      aria-label="Remove variant"
    >
      Remove
    </button>
  `;

  return row;
}


// ========================================
// RENDER VARIANTS
// ========================================

export function renderLotVariants() {
  const elements = getElements();

  if (!elements.container) return;

  elements.container.replaceChildren();

  variants.forEach(variant => {
    elements.container.appendChild(
      createVariantRow(variant)
    );
  });

  updateTotalQuantity();
}


// ========================================
// ADD VARIANT
// ========================================

export function addLotVariant(data = {}) {
  if (variants.length >= MAX_VARIANTS) {
    showProductMessage(
      `একটি Lot-এ সর্বোচ্চ ${MAX_VARIANTS}টি Variant Entry যোগ করা যাবে।`,
      'warning'
    );

    return false;
  }

  const variant = createVariant(data);

  variants.push(variant);

  renderLotVariants();

  return variant;
}


// ========================================
// REMOVE VARIANT
// ========================================

export function removeLotVariant(localId) {
  const initialLength = variants.length;

  variants = variants.filter(
    variant => variant.localId !== localId
  );

  if (variants.length === initialLength) {
    return false;
  }

  renderLotVariants();

  return true;
}


// ========================================
// READ ROW DATA
// ========================================

function readVariantRow(row) {
  return {
    localId: row.dataset.variantId || '',

    color: row.querySelector(
      '.lot-variant-color'
    )?.value.trim() || '',

    size: row.querySelector(
      '.lot-variant-size'
    )?.value.trim() || '',

    quantity: Number(
      row.querySelector(
        '.lot-variant-quantity'
      )?.value || 0
    ),

    note: row.querySelector(
      '.lot-variant-note'
    )?.value.trim() || ''
  };
}


// ========================================
// SYNC ROWS TO STATE
// ========================================

function syncVariantRows() {
  const elements = getElements();

  if (!elements.container) return;

  variants = Array.from(
    elements.container.querySelectorAll('.lot-variant-row')
  ).map(readVariantRow);
}


// ========================================
// GET VARIANT DATA
// ========================================

export function getLotVariantsData() {
  syncVariantRows();

  return variants.map(variant => ({
    color: variant.color,
    size: variant.size,
    quantity: variant.quantity,
    note: variant.note
  }));
}


// ========================================
// SET VARIANT DATA
// ========================================

export function setLotVariantsData(data = []) {
  if (!Array.isArray(data)) {
    showProductMessage(
      'Lot Variant Data সঠিক নয়।',
      'error'
    );

    return false;
  }

  variants = data.map(createVariant);

  renderLotVariants();

  return true;
}


// ========================================
// VALIDATE VARIANTS
// ========================================

export function validateLotVariants() {
  syncVariantRows();

  if (!variants.length) {
    showProductMessage(
      'কমপক্ষে একটি Color ও Size Variant যোগ করুন।',
      'warning'
    );

    return false;
  }

  const combinations = new Set();

  for (const variant of variants) {
    if (!variant.color) {
      showProductMessage(
        'প্রতিটি Variant-এর Color দিতে হবে।',
        'warning'
      );

      return false;
    }

    if (!variant.size) {
      showProductMessage(
        'প্রতিটি Variant-এর Size দিতে হবে।',
        'warning'
      );

      return false;
    }

    if (
      !Number.isSafeInteger(variant.quantity) ||
      variant.quantity <= 0
    ) {
      showProductMessage(
        'প্রতিটি Variant-এর Quantity অবশ্যই ১ বা তার বেশি পূর্ণসংখ্যা হতে হবে।',
        'warning'
      );

      return false;
    }

    const key = [
      variant.color.toLowerCase(),
      variant.size.toLowerCase()
    ].join('|');

    if (combinations.has(key)) {
      showProductMessage(
        `${variant.color} - ${variant.size} Variant একাধিকবার দেওয়া হয়েছে।`,
        'warning'
      );

      return false;
    }

    combinations.add(key);
  }

  return true;
}


// ========================================
// RESET VARIANTS
// ========================================

export function resetLotVariants() {
  variants = [];
  variantCounter = 0;

  renderLotVariants();
}


// ========================================
// BIND EVENTS
// ========================================

function bindEvents() {
  const elements = getElements();

  elements.addButton?.addEventListener('click', () => {
    addLotVariant();
  });

  elements.container?.addEventListener('click', event => {
    const button = event.target.closest(
      '[data-action="remove-variant"]'
    );

    if (!button) return;

    const row = button.closest('.lot-variant-row');

    if (!row) return;

    removeLotVariant(row.dataset.variantId);
  });

  elements.container?.addEventListener('input', event => {
    if (
      event.target.matches(
        '.lot-variant-quantity'
      )
    ) {
      syncVariantRows();
      updateTotalQuantity();
    }
  });

  elements.container?.addEventListener('change', event => {
    if (
      event.target.matches(
        '.lot-variant-color, .lot-variant-size'
      )
    ) {
      syncVariantRows();
    }
  });
}


// ========================================
// INITIALIZE
// ========================================

export function initLotVariants() {
  if (initialized) return;

  const elements = getElements();

  if (!elements.container) {
    console.warn(
      '[LOT VARIANTS] Container not found.'
    );

    return;
  }

  bindEvents();

  initialized = true;

  renderLotVariants();
}

export default initLotVariants;
