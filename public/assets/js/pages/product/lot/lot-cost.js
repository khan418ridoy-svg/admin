
'use strict';

// ========================================
// LOT HISTORY
// Purchase Lot Activity & Audit History
// ========================================

import {
  getProductElement,
  showProductMessage,
  productApiRequest,
  escapeProductHTML
} from '../product-utils.js';


// ========================================
// CONFIGURATION
// ========================================

const CONFIG = {
  historyUrl: productId =>
    `/api/products/${encodeURIComponent(productId)}/lots`,

  historyDetailUrl: (productId, lotId) =>
    `/api/products/${encodeURIComponent(productId)}/lots/${encodeURIComponent(lotId)}/history`
};

const SELECTORS = {
  modal: '#lot-history-modal',
  title: '#lot-history-title',
  subtitle: '#lot-history-subtitle',
  content: '#lot-history-content',
  close: '#lot-history-close',
  refresh: '#lot-history-refresh',
  search: '#lot-history-search',
  typeFilter: '#lot-history-type-filter'
};


// ========================================
// MODULE STATE
// ========================================

let initialized = false;

let currentProductId = '';
let currentLotId = '';

let historyItems = [];

let isLoading = false;


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    modal: getProductElement(SELECTORS.modal),
    title: getProductElement(SELECTORS.title),
    subtitle: getProductElement(SELECTORS.subtitle),
    content: getProductElement(SELECTORS.content),
    close: getProductElement(SELECTORS.close),
    refresh: getProductElement(SELECTORS.refresh),
    search: getProductElement(SELECTORS.search),
    typeFilter: getProductElement(SELECTORS.typeFilter)
  };
}


// ========================================
// NORMALIZE HISTORY ITEM
// ========================================

function normalizeHistoryItem(data = {}, index = 0) {
  return {
    id: String(data.id || data.eventId || index),

    type: String(
      data.type ||
      data.action ||
      'unknown'
    ),

    description: String(
      data.description ||
      data.message ||
      ''
    ),

    quantity: Number(data.quantity || 0),

    previousQuantity:
      data.previousQuantity == null
        ? null
        : Number(data.previousQuantity),

    newQuantity:
      data.newQuantity == null
        ? null
        : Number(data.newQuantity),

    color: String(data.color || ''),
    size: String(data.size || ''),

    cost: data.cost == null
      ? null
      : Number(data.cost),

    performedBy: String(
      data.performedByName ||
      data.performedBy ||
      data.userName ||
      'System'
    ),

    createdAt:
      data.createdAt ||
      data.timestamp ||
      data.date ||
      null
  };
}


// ========================================
// FORMAT DATE
// ========================================

function formatHistoryDate(value) {
  if (!value) return 'Date unavailable';

  let date;

  if (typeof value === 'object' && value.seconds) {
    date = new Date(value.seconds * 1000);
  } else if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    date = new Date(value);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat('en-BD', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}


// ========================================
// FORMAT QUANTITY
// ========================================

function formatQuantity(value) {
  if (!Number.isFinite(value)) return '0';

  return new Intl.NumberFormat('en-BD').format(value);
}


// ========================================
// FORMAT COST
// ========================================

function formatCost(value) {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }

  return `৳ ${new Intl.NumberFormat('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)}`;
}


// ========================================
// GET EVENT LABEL
// ========================================

function getEventLabel(type) {
  const labels = {
    created: 'Lot Created',
    lot_created: 'Lot Created',

    stock_added: 'Stock Added',
    quantity_added: 'Quantity Added',

    sold: 'Stock Sold',
    stock_sold: 'Stock Sold',

    returned: 'Stock Returned',
    stock_returned: 'Stock Returned',

    adjusted: 'Stock Adjusted',
    stock_adjusted: 'Stock Adjusted',

    damaged: 'Stock Damaged',
    stock_damaged: 'Stock Damaged',

    cancelled: 'Stock Reversed',
    stock_reversed: 'Stock Reversed',

    cost_updated: 'Cost Updated',
    updated: 'Lot Updated',

    deleted: 'Lot Deleted'
  };

  return labels[type.toLowerCase()] || 'Other Activity';
}


// ========================================
// GET EVENT CLASS
// ========================================

function getEventClass(type) {
  const value = type.toLowerCase();

  if (
    value.includes('created') ||
    value.includes('added') ||
    value.includes('returned')
  ) {
    return 'success';
  }

  if (
    value.includes('sold') ||
    value.includes('damaged') ||
    value.includes('deleted')
  ) {
    return 'warning';
  }

  if (
    value.includes('adjusted') ||
    value.includes('updated') ||
    value.includes('cost')
  ) {
    return 'info';
  }

  return 'neutral';
}


// ========================================
// GET FILTERED HISTORY
// ========================================

function getFilteredHistory() {
  const elements = getElements();

  const search = (
    elements.search?.value || ''
  ).trim().toLowerCase();

  const selectedType = (
    elements.typeFilter?.value || 'all'
  ).toLowerCase();

  return historyItems.filter(item => {
    const matchesType =
      selectedType === 'all' ||
      item.type.toLowerCase() === selectedType;

    const searchableText = [
      item.type,
      item.description,
      item.color,
      item.size,
      item.performedBy
    ].join(' ').toLowerCase();

    const matchesSearch =
      !search ||
      searchableText.includes(search);

    return matchesType && matchesSearch;
  });
}


// ========================================
// RENDER HISTORY ITEM
// ========================================

function renderHistoryItem(item) {
  const eventLabel = getEventLabel(item.type);
  const eventClass = getEventClass(item.type);

  const variantLabel = [
    item.color,
    item.size
  ].filter(Boolean).join(' / ');

  const quantityChange = (
    item.previousQuantity !== null ||
    item.newQuantity !== null
  )
    ? `
      <div class="lot-history-quantity-change">
        <span>Previous: ${formatQuantity(item.previousQuantity ?? 0)}</span>
        <span>→</span>
        <strong>New: ${formatQuantity(item.newQuantity ?? 0)}</strong>
      </div>
    `
    : `
      <div class="lot-history-quantity-change">
        Quantity:
        <strong>${formatQuantity(item.quantity)}</strong>
      </div>
    `;

  return `
    <article
      class="lot-history-item"
      data-history-id="${escapeProductHTML(item.id)}"
    >

      <div class="lot-history-indicator ${eventClass}"></div>

      <div class="lot-history-item-body">

        <div class="lot-history-item-header">

          <strong>
            ${escapeProductHTML(eventLabel)}
          </strong>

          <time>
            ${escapeProductHTML(formatHistoryDate(item.createdAt))}
          </time>

        </div>

        ${
          item.description
            ? `
              <p class="lot-history-description">
                ${escapeProductHTML(item.description)}
              </p>
            `
            : ''
        }

        ${
          variantLabel
            ? `
              <div class="lot-history-variant">
                Variant:
                ${escapeProductHTML(variantLabel)}
              </div>
            `
            : ''
        }

        ${quantityChange}

        ${
          item.cost !== null
            ? `
              <div class="lot-history-cost">
                Cost: ${escapeProductHTML(formatCost(item.cost))}
              </div>
            `
            : ''
        }

        <div class="lot-history-user">
          By: ${escapeProductHTML(item.performedBy)}
        </div>

      </div>

    </article>
  `;
}


// ========================================
// RENDER HISTORY
// ========================================

export function renderLotHistory() {
  const elements = getElements();

  if (!elements.content) return;

  const filtered = getFilteredHistory();

  if (!filtered.length) {
    elements.content.innerHTML = `
      <div class="lot-history-empty">
        <p>No history records found.</p>
      </div>
    `;

    return;
  }

  elements.content.innerHTML = `
    <div class="lot-history-timeline">

      ${filtered.map(renderHistoryItem).join('')}

    </div>
  `;
}


// ========================================
// SET HISTORY DATA
// ========================================

export function setLotHistory(data = []) {
  if (!Array.isArray(data)) {
    showProductMessage(
      'Lot History Data সঠিক নয়।',
      'error'
    );

    return false;
  }

  historyItems = data.map(normalizeHistoryItem);

  renderLotHistory();

  return true;
}


// ========================================
// GET HISTORY DATA
// ========================================

export function getLotHistory() {
  return [...historyItems];
}


// ========================================
// OPEN HISTORY MODAL
// ========================================

export function openLotHistory(productId, lotId) {
  if (!productId || !lotId) {
    showProductMessage(
      'Product ID এবং Lot ID প্রয়োজন।',
      'warning'
    );

    return false;
  }

  currentProductId = String(productId);
  currentLotId = String(lotId);

  const elements = getElements();

  if (!elements.modal) {
    showProductMessage(
      'Lot History Modal পাওয়া যায়নি।',
      'error'
    );

    return false;
  }

  if (elements.title) {
    elements.title.textContent = 'Lot History';
  }

  if (elements.subtitle) {
    elements.subtitle.textContent =
      `Lot ID: ${currentLotId}`;
  }

  if (elements.search) {
    elements.search.value = '';
  }

  if (elements.typeFilter) {
    elements.typeFilter.value = 'all';
  }

  historyItems = [];

  elements.modal.hidden = false;
  elements.modal.setAttribute('aria-hidden', 'false');

  loadLotHistory(currentProductId, currentLotId);

  return true;
}


// ========================================
// CLOSE HISTORY MODAL
// ========================================

export function closeLotHistory() {
  const elements = getElements();

  if (elements.modal) {
    elements.modal.hidden = true;
    elements.modal.setAttribute('aria-hidden', 'true');
  }

  currentLotId = '';
  historyItems = [];

  isLoading = false;
}


// ========================================
// LOAD LOT HISTORY
// ========================================

export async function loadLotHistory(
  productId = currentProductId,
  lotId = currentLotId
) {
  if (!productId || !lotId) return false;

  if (isLoading) return false;

  isLoading = true;

  const elements = getElements();

  if (elements.content) {
    elements.content.innerHTML = `
      <div class="lot-history-loading">
        Loading Lot History...
      </div>
    `;
  }

  try {
    const url = CONFIG.historyDetailUrl(
      productId,
      lotId
    );

    const result = await productApiRequest(url, {
      method: 'GET'
    });

    if (
      productId !== currentProductId ||
      lotId !== currentLotId
    ) {
      return false;
    }

    const data =
      result?.data?.history ??
      result?.data?.items ??
      result?.history ??
      [];

    if (!Array.isArray(data)) {
      throw new Error(
        'Invalid Lot History response.'
      );
    }

    setLotHistory(data);

    if (elements.subtitle) {
      elements.subtitle.textContent =
        `Lot ID: ${lotId} · ${data.length} activities`;
    }

    return true;

  } catch (error) {
    console.error(
      '[LOT HISTORY] Load failed:',
      error
    );

    if (elements.content) {
      elements.content.innerHTML = `
        <div class="lot-history-error">
          <p>Failed to load Lot History.</p>

          <button
            type="button"
            data-action="retry-lot-history"
          >
            Try Again
          </button>
        </div>
      `;
    }

    showProductMessage(
      error.message || 'Lot History Load করা যায়নি।',
      'error'
    );

    return false;

  } finally {
    isLoading = false;
  }
}


// ========================================
// REFRESH HISTORY
// ========================================

export function refreshLotHistory() {
  if (!currentProductId || !currentLotId) {
    return Promise.resolve(false);
  }

  return loadLotHistory(
    currentProductId,
    currentLotId
  );
}


// ========================================
// RESET HISTORY
// ========================================

export function resetLotHistory() {
  closeLotHistory();

  historyItems = [];
  currentProductId = '';

  const elements = getElements();

  if (elements.content) {
    elements.content.replaceChildren();
  }

  if (elements.title) {
    elements.title.textContent = 'Lot History';
  }

  if (elements.subtitle) {
    elements.subtitle.textContent = '';
  }
}


// ========================================
// BIND EVENTS
// ========================================

function bindEvents() {
  const elements = getElements();

  elements.close?.addEventListener('click', () => {
    closeLotHistory();
  });

  elements.refresh?.addEventListener('click', () => {
    refreshLotHistory();
  });

  elements.search?.addEventListener('input', () => {
    renderLotHistory();
  });

  elements.typeFilter?.addEventListener('change', () => {
    renderLotHistory();
  });

  elements.modal?.addEventListener('click', event => {
    if (event.target === elements.modal) {
      closeLotHistory();
    }

    const retryButton = event.target.closest(
      '[data-action="retry-lot-history"]'
    );

    if (retryButton) {
      refreshLotHistory();
    }
  });

  document.addEventListener(
    'product:lot-history',
    event => {
      const detail = event.detail || {};

      openLotHistory(
        detail.productId,
        detail.lotId
      );
    }
  );

  document.addEventListener('keydown', event => {
    if (
      event.key === 'Escape' &&
      !elements.modal?.hidden
    ) {
      closeLotHistory();
    }
  });
}


// ========================================
// INITIALIZE
// ========================================

export function initLotHistory() {
  if (initialized) return;

  bindEvents();

  initialized = true;
}

export default initLotHistory;
