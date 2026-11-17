
'use strict';

// ========================================
// PRODUCT SHARED UTILITIES
// Common helpers for Product modules
// ========================================


// ========================================
// GET PRODUCT PAGE ROOT
// ========================================

export function getProductRoot() {
  return (
    document.querySelector('#product-page') ||
    document.querySelector('.product-page') ||
    document
  );
}


// ========================================
// GET PRODUCT ELEMENT
// ========================================

export function getProductElement(selector, root = null) {
  if (!selector) return null;

  const scope = root || getProductRoot();

  return scope.querySelector(selector);
}


// ========================================
// GET ALL PRODUCT ELEMENTS
// ========================================

export function getProductElements(selector, root = null) {
  if (!selector) return [];

  const scope = root || getProductRoot();

  return Array.from(scope.querySelectorAll(selector));
}


// ========================================
// SHOW PRODUCT MESSAGE
// ========================================

export function showProductMessage(
  message,
  type = 'info',
  duration = 3500
) {
  const text = String(message || '').trim();

  if (!text) return;

  const existing = document.querySelector(
    '#product-global-message'
  );

  if (existing) {
    existing.remove();
  }

  const element = document.createElement('div');

  element.id = 'product-global-message';
  element.className = `product-message product-message-${type}`;
  element.setAttribute('role', 'status');
  element.textContent = text;

  document.body.appendChild(element);

  requestAnimationFrame(() => {
    element.classList.add('is-visible');
  });

  if (duration > 0) {
    window.setTimeout(() => {
      element.classList.remove('is-visible');

      window.setTimeout(() => {
        element.remove();
      }, 250);
    }, duration);
  }

  return element;
}


// ========================================
// ESCAPE HTML
// ========================================

export function escapeProductHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ========================================
// FORMAT PRICE
// ========================================

export function formatProductPrice(
  value,
  currency = 'BDT'
) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return '৳0.00';
  }

  try {
    return new Intl.NumberFormat('en-BD', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `৳${amount.toFixed(2)}`;
  }
}


// ========================================
// SAFE JSON RESPONSE
// ========================================

export async function parseProductResponse(response) {
  const contentType =
    response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text();

    throw new Error(
      text || `Unexpected server response (${response.status})`
    );
  }

  return response.json();
}


// ========================================
// API REQUEST HELPER
// ========================================

export async function productApiRequest(
  url,
  options = {}
) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? {
        'Content-Type': 'application/json'
      } : {}),
      ...(options.headers || {})
    }
  });

  const result = await parseProductResponse(response);

  if (!response.ok || result?.success === false) {
    throw new Error(
      result?.message ||
      result?.error ||
      `Request failed (${response.status})`
    );
  }

  return result;
}


// ========================================
// GET PRODUCT ID
// ========================================

export function getCurrentProductId() {
  const root = getProductRoot();

  return (
    root.querySelector('[name="productId"]')?.value ||
    root.querySelector('#product-id')?.value ||
    root.dataset.productId ||
    ''
  ).trim();
}


// ========================================
// SET BUTTON LOADING
// ========================================

export function setProductButtonLoading(
  button,
  loading,
  loadingText = 'Please wait...'
) {
  if (!button) return;

  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText =
        button.textContent.trim();
    }

    button.disabled = true;
    button.textContent = loadingText;
    button.setAttribute('aria-busy', 'true');

    return;
  }

  button.disabled = false;

  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }

  button.removeAttribute('aria-busy');
}


// ========================================
// NORMALIZE STRING
// ========================================

export function normalizeProductText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}


// ========================================
// SAFE NUMBER
// ========================================

export function getProductNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}


// ========================================
// RESET FORM ELEMENTS
// ========================================

export function resetProductElements(selectors = []) {
  selectors.forEach(selector => {
    const element = getProductElement(selector);

    if (!element) return;

    if (element.type === 'checkbox' || element.type === 'radio') {
      element.checked = false;
    } else {
      element.value = '';
    }
  });
}
