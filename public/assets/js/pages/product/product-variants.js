
'use strict';

// ========================================
// PRODUCT VARIANTS
// Color, Size, SKU, Barcode, Price & Stock
// ========================================

import {
  getProductElement,
  showProductMessage
} from './product-utils.js';


// ========================================
// STATE
// ========================================

let variants = [];
let initialized = false;


// ========================================
// SELECTORS
// ========================================

const SELECTORS = {
  container: '#product-variants-container',
  addButton: '#add-product-variant',
  regularPrice: '#product-regular-price',
  sellingPrice: '#product-selling-price'
};


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    container: getProductElement(SELECTORS.container),
    addButton: getProductElement(SELECTORS.addButton),
    regularPrice: getProductElement(SELECTORS.regularPrice),
    sellingPrice: getProductElement(SELECTORS.sellingPrice)
  };
}


// ========================================
// GENERATE VARIANT ID
// ========================================

function generateVariantId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `variant-${Date.now()}-${Math.random()
    .toString(36).slice(2, 10)}`;
}


// ========================================
// ESCAPE HTML
// ========================================

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}


// ========================================
// CREATE VARIANT
// ========================================

function createVariant(data = {}) {
  return {
    localId: data.localId || generateVariantId(),

    color: data.color || '',
    size: data.size || '',

    variantSku: data.variantSku || '',
    barcode: data.barcode || '',

    regularPrice: Number(data.regularPrice) || 0,
    sellingPrice: Number(data.sellingPrice) || 0,

    discountPercent: Number(data.discountPercent) || 0,

    stock: Number(data.stock) || 0,
    lowStockAlert: Number(data.lowStockAlert) || 0,

    isActive: data.isActive !== false
  };
}


// ========================================
// GET VARIANT HTML
// ========================================

function getVariantHTML(variant, index) {
  return `
    <div class="product-variant-item"
         data-variant-id="${escapeHTML(variant.localId)}">

      <div class="product-variant-header">
        <strong>Variant ${index + 1}</strong>

        <button type="button"
                class="remove-product-variant"
                data-action="remove"
                aria-label="Remove variant">
          Remove
        </button>
      </div>

      <div class="product-variant-grid">

        <label>
          Color
          <input type="text"
                 data-field="color"
                 value="${escapeHTML(variant.color)}"
                 placeholder="Black">
        </label>

        <label>
          Size
          <input type="text"
                 data-field="size"
                 value="${escapeHTML(variant.size)}"
                 placeholder="M">
        </label>

        <label>
          Variant SKU
          <input type="text"
                 data-field="variantSku"
                 value="${escapeHTML(variant.variantSku)}"
                 placeholder="Auto generated"
                 readonly>
        </label>

        <label>
          Barcode
          <input type="text"
                 data-field="barcode"
                 value="${escapeHTML(variant.barcode)}"
                 placeholder="Auto generated"
                 readonly>
        </label>

        <label>
          Regular Price
          <input type="number"
                 data-field="regularPrice"
                 min="0"
                 step="0.01"
                 value="${variant.regularPrice}">
        </label>

        <label>
          Selling Price
          <input type="number"
                 data-field="sellingPrice"
                 min="0"
                 step="0.01"
                 value="${variant.sellingPrice}">
        </label>

        <label>
          Discount (%)
          <input type="number"
                 data-field="discountPercent"
                 value="${variant.discountPercent}"
                 readonly>
        </label>

        <label>
          Stock
          <input type="number"
                 data-field="stock"
                 min="0"
                 step="1"
                 value="${variant.stock}">
        </label>

        <label>
          Low Stock Alert
          <input type="number"
                 data-field="lowStockAlert"
                 min="0"
                 step="1"
                 value="${variant.lowStockAlert}">
        </label>

        <label class="product-variant-active">
          <input type="checkbox"
                 data-field="isActive"
                 ${variant.isActive ? 'checked' : ''}>
          Active
        </label>

      </div>
    </div>
  `;
}


// ========================================
// RENDER VARIANTS
// ========================================

function renderVariants() {
  const { container } = getElements();

  if (!container) return;

  container.innerHTML = variants
    .map((variant, index) => getVariantHTML(variant, index))
    .join('');
}


// ========================================
// UPDATE VARIANT VALUE
// ========================================

function updateVariantValue(element) {
  const item = element.closest('.product-variant-item');

  if (!item) return;

  const variant = variants.find(
    entry => entry.localId === item.dataset.variantId
  );

  if (!variant) return;

  const field = element.dataset.field;

  if (!field || !(field in variant)) return;

  if (field === 'isActive') {
    variant.isActive = element.checked;
    return;
  }

  if (
    ['regularPrice', 'sellingPrice', 'stock', 'lowStockAlert']
      .includes(field)
  ) {
    variant[field] = element.value === ''
      ? 0
      : Number(element.value);
  } else {
    variant[field] = element.value;
  }

  if (field === 'regularPrice' || field === 'sellingPrice') {
    updateVariantDiscount(variant, item);
  }
}


// ========================================
// UPDATE VARIANT DISCOUNT
// ========================================

function updateVariantDiscount(variant, item) {
  const regular = Number(variant.regularPrice);
  const selling = Number(variant.sellingPrice);

  let discount = 0;

  if (
    regular > 0 &&
    selling >= 0 &&
    selling <= regular
  ) {
    discount = Number(
      (((regular - selling) / regular) * 100).toFixed(2)
    );
  }

  variant.discountPercent = discount;

  const input = item.querySelector(
    '[data-field="discountPercent"]'
  );

  if (input) input.value = discount;
}


// ========================================
// ADD VARIANT
// ========================================

export function addProductVariant(data = {}) {
  const { container } = getElements();

  if (!container) {
    showProductMessage(
      'Variant container পাওয়া যায়নি।',
      'error'
    );
    return;
  }

  const variant = createVariant(data);

  variants.push(variant);

  renderVariants();
}


// ========================================
// REMOVE VARIANT
// ========================================

function removeProductVariant(localId) {
  variants = variants.filter(
    variant => variant.localId !== localId
  );

  renderVariants();
}


// ========================================
// VALIDATE VARIANTS
// ========================================

export function validateProductVariants() {
  if (!variants.length) {
    showProductMessage(
      'কমপক্ষে একটি Variant যোগ করুন।',
      'warning'
    );
    return false;
  }

  const seen = new Set();

  for (const variant of variants) {
    if (!variant.color.trim()) {
      showProductMessage('Variant Color লিখুন।', 'warning');
      return false;
    }

    if (!variant.size.trim()) {
      showProductMessage('Variant Size লিখুন।', 'warning');
      return false;
    }

    const key = `${variant.color.trim().toLowerCase()}::${variant.size.trim().toLowerCase()}`;

    if (seen.has(key)) {
      showProductMessage(
        'একই Color ও Size-এর একাধিক Variant রাখা যাবে না।',
        'warning'
      );
      return false;
    }

    seen.add(key);

    if (
      !Number.isFinite(variant.regularPrice) ||
      !Number.isFinite(variant.sellingPrice) ||
      variant.regularPrice <= 0 ||
      variant.sellingPrice <= 0 ||
      variant.sellingPrice > variant.regularPrice
    ) {
      showProductMessage(
        'Variant-এর Regular ও Selling Price সঠিকভাবে দিন।',
        'warning'
      );
      return false;
    }

    if (
      !Number.isInteger(variant.stock) ||
      variant.stock < 0 ||
      !Number.isInteger(variant.lowStockAlert) ||
      variant.lowStockAlert < 0
    ) {
      showProductMessage(
        'Variant-এর Stock ও Low Stock Alert সঠিক হতে হবে।',
        'warning'
      );
      return false;
    }
  }

  return true;
}


// ========================================
// GET VARIANT DATA
// ========================================

export function getProductVariantsData() {
  return variants.map(variant => ({
    color: variant.color.trim(),
    size: variant.size.trim(),

    variantSku: variant.variantSku,
    barcode: variant.barcode,

    regularPrice: variant.regularPrice,
    sellingPrice: variant.sellingPrice,
    discountPercent: variant.discountPercent,

    stock: variant.stock,
    lowStockAlert: variant.lowStockAlert,

    isActive: variant.isActive
  }));
}


// ========================================
// SET VARIANT DATA (EDIT PRODUCT)
// ========================================

export function setProductVariantsData(data = []) {
  if (!Array.isArray(data)) {
    console.error('[PRODUCT VARIANTS] Invalid variant data.');
    return;
  }

  variants = data.map(createVariant);

  renderVariants();
}


// ========================================
// RESET VARIANTS
// ========================================

export function resetProductVariants() {
  variants = [];
  renderVariants();
}


// ========================================
// BIND EVENTS
// ========================================

function bindVariantEvents() {
  const { container, addButton } = getElements();

  addButton?.addEventListener('click', () => {
    addProductVariant();
  });

  container?.addEventListener('input', event => {
    const element = event.target;

    if (!element.matches('[data-field]')) return;

    updateVariantValue(element);
  });

  container?.addEventListener('change', event => {
    const element = event.target;

    if (!element.matches('[data-field="isActive"]')) return;

    updateVariantValue(element);
  });

  container?.addEventListener('click', event => {
    const button = event.target.closest(
      '[data-action="remove"]'
    );

    if (!button) return;

    const item = button.closest('.product-variant-item');

    if (!item) return;

    removeProductVariant(item.dataset.variantId);
  });
}


// ========================================
// INITIALIZE
// ========================================

export function initProductVariants() {
  if (initialized) return;

  const { container, addButton } = getElements();

  if (!container || !addButton) {
    console.warn(
      '[PRODUCT VARIANTS] Required HTML elements not found.'
    );
    return;
  }

  bindVariantEvents();

  initialized = true;

  renderVariants();
}


// ========================================
// DEFAULT EXPORT
// ========================================

export default initProductVariants;
