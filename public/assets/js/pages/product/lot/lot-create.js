
'use strict';

// ========================================
// LOT CREATE
// Create New Product Purchase Lot
// ========================================

import {
  getProductElement,
  showProductMessage,
  productApiRequest,
  setProductButtonLoading
} from '../product-utils.js';


// ========================================
// CONFIGURATION
// ========================================

const CONFIG = {
  apiUrl: '/api/products',
  modal: '#lot-create-modal',
  form: '#lot-create-form',

  lotNumber: '#lot-number',
  purchaseDate: '#lot-purchase-date',
  supplier: '#lot-supplier',
  purchaseNote: '#lot-purchase-note',

  submitButton: '#lot-create-submit',
  cancelButton: '#lot-create-cancel',
  openButton: '#product-lot-create'
};


// ========================================
// MODULE STATE
// ========================================

let initialized = false;
let currentProductId = null;
let isSubmitting = false;


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    modal: getProductElement(CONFIG.modal),
    form: getProductElement(CONFIG.form),

    lotNumber: getProductElement(CONFIG.lotNumber),
    purchaseDate: getProductElement(CONFIG.purchaseDate),
    supplier: getProductElement(CONFIG.supplier),
    purchaseNote: getProductElement(CONFIG.purchaseNote),

    submitButton: getProductElement(CONFIG.submitButton),
    cancelButton: getProductElement(CONFIG.cancelButton),
    openButton: getProductElement(CONFIG.openButton)
  };
}


// ========================================
// SET PRODUCT ID
// ========================================

export function setLotCreateProductId(productId) {
  currentProductId = productId || null;
}


// ========================================
// GET PRODUCT ID
// ========================================

export function getLotCreateProductId() {
  return currentProductId;
}


// ========================================
// OPEN LOT CREATE MODAL
// ========================================

export function openLotCreate(productId = currentProductId) {
  const elements = getElements();

  if (!elements.modal) {
    showProductMessage(
      'Lot Create Modal পাওয়া যায়নি।',
      'error'
    );

    return false;
  }

  if (!productId) {
    showProductMessage(
      'প্রথমে Product নির্বাচন করুন।',
      'warning'
    );

    return false;
  }

  currentProductId = productId;

  resetLotCreate();

  const dateInput = elements.purchaseDate;

  if (dateInput) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  elements.modal.hidden = false;
  elements.modal.classList.add('is-open');

  elements.modal.setAttribute('aria-hidden', 'false');

  return true;
}


// ========================================
// CLOSE LOT CREATE MODAL
// ========================================

export function closeLotCreate() {
  const elements = getElements();

  if (!elements.modal) return;

  elements.modal.classList.remove('is-open');
  elements.modal.hidden = true;

  elements.modal.setAttribute('aria-hidden', 'true');
}


// ========================================
// GET LOT BASIC DATA
// ========================================

export function getLotCreateData() {
  const elements = getElements();

  return {
    lotNumber: elements.lotNumber?.value.trim() || '',
    purchaseDate: elements.purchaseDate?.value || '',
    supplier: elements.supplier?.value.trim() || '',
    purchaseNote: elements.purchaseNote?.value.trim() || ''
  };
}


// ========================================
// VALIDATE LOT DATA
// ========================================

export function validateLotCreate() {
  const elements = getElements();
  const data = getLotCreateData();

  if (!currentProductId) {
    showProductMessage(
      'Product ID পাওয়া যায়নি।',
      'error'
    );

    return false;
  }

  if (!data.purchaseDate) {
    showProductMessage(
      'Purchase Date নির্বাচন করুন।',
      'warning'
    );

    elements.purchaseDate?.focus();

    return false;
  }

  const purchaseDate = new Date(
    `${data.purchaseDate}T00:00:00`
  );

  if (Number.isNaN(purchaseDate.getTime())) {
    showProductMessage(
      'সঠিক Purchase Date দিন।',
      'warning'
    );

    elements.purchaseDate?.focus();

    return false;
  }

  if (
    data.lotNumber &&
    data.lotNumber.length > 60
  ) {
    showProductMessage(
      'Lot Number সর্বোচ্চ 60 অক্ষর হতে পারবে।',
      'warning'
    );

    elements.lotNumber?.focus();

    return false;
  }

  if (data.supplier.length > 150) {
    showProductMessage(
      'Supplier Name সর্বোচ্চ 150 অক্ষর হতে পারবে।',
      'warning'
    );

    elements.supplier?.focus();

    return false;
  }

  if (data.purchaseNote.length > 1000) {
    showProductMessage(
      'Purchase Note সর্বোচ্চ 1000 অক্ষর হতে পারবে।',
      'warning'
    );

    elements.purchaseNote?.focus();

    return false;
  }

  return true;
}


// ========================================
// CREATE LOT API
// ========================================

export async function createProductLot() {
  if (isSubmitting) return false;

  if (!validateLotCreate()) return false;

  const elements = getElements();

  isSubmitting = true;

  setProductButtonLoading(
    elements.submitButton,
    true,
    'Creating Lot...'
  );

  try {
    const payload = {
      ...getLotCreateData()
    };

    // Lot Number optional:
    // Backend should generate a unique Lot Number
    // when it is not supplied.

    if (!payload.lotNumber) {
      delete payload.lotNumber;
    }

    const result = await productApiRequest(
      `${CONFIG.apiUrl}/${encodeURIComponent(currentProductId)}/lots`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );

    const createdLot = result.data?.lot || result.data;

    if (!createdLot?.id && !createdLot?.lotId) {
      throw new Error(
        'Lot তৈরি হয়েছে কি না নিশ্চিত করা যায়নি: Backend response-এ Lot ID নেই।'
      );
    }

    showProductMessage(
      'নতুন Purchase Lot তৈরি হয়েছে।',
      'success'
    );

    closeLotCreate();

    document.dispatchEvent(
      new CustomEvent('product:lot-created', {
        detail: {
          productId: currentProductId,
          lot: createdLot
        }
      })
    );

    return createdLot;

  } catch (error) {
    console.error('[LOT CREATE]', error);

    showProductMessage(
      error.message || 'Purchase Lot তৈরি করা যায়নি।',
      'error'
    );

    return false;

  } finally {
    isSubmitting = false;

    setProductButtonLoading(
      elements.submitButton,
      false
    );
  }
}


// ========================================
// RESET LOT CREATE FORM
// ========================================

export function resetLotCreate() {
  const elements = getElements();

  elements.form?.reset();

  isSubmitting = false;
}


// ========================================
// BIND EVENTS
// ========================================

function bindEvents() {
  const elements = getElements();

  elements.openButton?.addEventListener('click', () => {
    openLotCreate();
  });

  elements.cancelButton?.addEventListener('click', () => {
    closeLotCreate();
  });

  elements.form?.addEventListener('submit', event => {
    event.preventDefault();

    createProductLot();
  });

  elements.modal?.addEventListener('click', event => {
    if (event.target === elements.modal) {
      closeLotCreate();
    }
  });
}


// ========================================
// INITIALIZE
// ========================================

export function initLotCreate() {
  if (initialized) return;

  const elements = getElements();

  if (!elements.modal || !elements.form) {
    console.warn(
      '[LOT CREATE] Modal or form element not found.'
    );

    return;
  }

  bindEvents();

  initialized = true;
}

export default initLotCreate;
