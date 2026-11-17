
'use strict';

import { navigateTo } from '../../index.js';

// ========================================
// Configuration
// ========================================

// Backend API এখনো যাচাই করা হয়নি।
// Backend তৈরি হলে প্রয়োজন অনুযায়ী URL পরিবর্তন করবেন।
const API_URL = '/api/lots';

// ========================================
// Helpers
// ========================================

function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== '') {
    element.textContent = String(text);
  }

  return element;
}

function getValue(...values) {
  return values.find(value =>
    value !== undefined &&
    value !== null &&
    value !== ''
  );
}

function formatDate(value) {
  if (!value) return '—';

  let date;

  if (typeof value === 'object' && value.seconds) {
    date = new Date(value.seconds * 1000);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number.toLocaleString('en-US')
    : '0';
}

function normalizeStatus(status) {
  return String(status || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function getStatusLabel(status) {
  const labels = {
    active: 'Active',
    completed: 'Completed',
    depleted: 'Depleted',
    empty: 'Empty',
    inactive: 'Inactive',
    cancelled: 'Cancelled',
    unknown: 'Unknown'
  };

  return labels[normalizeStatus(status)] || status || 'Unknown';
}

function getStatusClass(status) {
  const normalized = normalizeStatus(status);

  const allowed = [
    'active',
    'completed',
    'depleted',
    'empty',
    'inactive',
    'cancelled'
  ];

  return allowed.includes(normalized)
    ? normalized
    : 'unknown';
}

// ========================================
// API
// ========================================

async function fetchLots(signal) {
  const response = await fetch(API_URL, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json'
    },
    signal
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error('Invalid server response.');
  }

  if (!response.ok) {
    throw new Error(
      result?.message ||
      result?.error ||
      `Unable to load lots (${response.status}).`
    );
  }

  if (result?.success === false) {
    throw new Error(
      result.message || 'Unable to load lots.'
    );
  }

  const lots = Array.isArray(result)
    ? result
    : Array.isArray(result?.lots)
      ? result.lots
      : Array.isArray(result?.data?.lots)
        ? result.data.lots
        : Array.isArray(result?.data)
          ? result.data
          : null;

  if (!lots) {
    throw new Error(
      'Invalid lots API response. Expected a lots array.'
    );
  }

  return lots;
}

// ========================================
// Lot Data
// ========================================

function normalizeLot(lot) {
  const product = lot.product || {};

  return {
    id: getValue(lot.id, lot.lotId, lot.lotNumber),
    lotNumber: getValue(
      lot.lotNumber,
      lot.lotNo,
      lot.number,
      lot.id,
      '—'
    ),
    productId: getValue(
      lot.productId,
      product.id,
      product.productId
    ),
    productName: getValue(
      lot.productName,
      product.name,
      product.title,
      'Unknown Product'
    ),
    purchaseDate: getValue(
      lot.purchaseDate,
      lot.createdAt,
      lot.date
    ),
    supplier: getValue(
      lot.supplier,
      lot.supplierName,
      '—'
    ),
    totalQuantity: getValue(
      lot.totalQuantity,
      lot.totalQty,
      lot.quantity,
      0
    ),
    remainingQuantity: getValue(
      lot.remainingQuantity,
      lot.remainingQty,
      lot.availableQuantity,
      0
    ),
    status: getValue(
      lot.status,
      'unknown'
    )
  };
}

// ========================================
// Page Elements
// ========================================

function createPage() {
  const page = createElement(
    'section',
    'purchase-lots-page'
  );

  const header = createElement(
    'div',
    'page-header'
  );

  const headingGroup = createElement('div');

  const title = createElement(
    'h1',
    '',
    'Purchase Lots'
  );

  const subtitle = createElement(
    'p',
    '',
    'View and manage purchase lots across products.'
  );

  headingGroup.append(title, subtitle);

  const refreshButton = createElement(
    'button',
    'btn btn-secondary',
    'Refresh'
  );

  refreshButton.type = 'button';
  refreshButton.id = 'lots-refresh';

  header.append(headingGroup, refreshButton);

  // Filters
  const filters = createElement(
    'div',
    'lots-filters'
  );

  const search = createElement('input', 'form-control');
  search.type = 'search';
  search.id = 'lots-search';
  search.placeholder = 'Search product, lot number, supplier...';
  search.setAttribute('aria-label', 'Search purchase lots');

  const statusFilter = createElement(
    'select',
    'form-control'
  );

  statusFilter.id = 'lots-status-filter';
  statusFilter.setAttribute(
    'aria-label',
    'Filter lots by status'
  );

  [
    ['all', 'All Statuses'],
    ['active', 'Active'],
    ['completed', 'Completed'],
    ['depleted', 'Depleted'],
    ['empty', 'Empty'],
    ['inactive', 'Inactive'],
    ['cancelled', 'Cancelled']
  ].forEach(([value, label]) => {
    const option = createElement('option', '', label);
    option.value = value;
    statusFilter.append(option);
  });

  filters.append(search, statusFilter);

  // Summary
  const summary = createElement(
    'div',
    'lots-summary'
  );

  summary.id = 'lots-summary';

  // Table
  const tableWrapper = createElement(
    'div',
    'table-responsive lots-table-wrapper'
  );

  const table = createElement(
    'table',
    'table lots-table'
  );

  const thead = createElement('thead');
  const headerRow = createElement('tr');

  [
    'Lot Number',
    'Product',
    'Purchase Date',
    'Supplier',
    'Total Qty',
    'Remaining Qty',
    'Status',
    'Action'
  ].forEach(label => {
    headerRow.append(
      createElement('th', '', label)
    );
  });

  thead.append(headerRow);

  const tbody = createElement('tbody');
  tbody.id = 'lots-table-body';

  table.append(thead, tbody);
  tableWrapper.append(table);

  const message = createElement(
    'div',
    'lots-message'
  );

  message.id = 'lots-message';
  message.setAttribute('aria-live', 'polite');

  page.append(
    header,
    filters,
    summary,
    message,
    tableWrapper
  );

  return page;
}

// ========================================
// Summary
// ========================================

function renderSummary(container, lots) {
  const totalLots = lots.length;

  const totalQuantity = lots.reduce(
    (sum, lot) => sum + Number(lot.totalQuantity || 0),
    0
  );

  const remainingQuantity = lots.reduce(
    (sum, lot) => sum + Number(lot.remainingQuantity || 0),
    0
  );

  const activeLots = lots.filter(
    lot => normalizeStatus(lot.status) === 'active'
  ).length;

  const cards = [
    ['Total Lots', totalLots],
    ['Active Lots', activeLots],
    ['Total Quantity', formatNumber(totalQuantity)],
    ['Remaining Quantity', formatNumber(remainingQuantity)]
  ];

  container.replaceChildren();

  cards.forEach(([label, value]) => {
    const card = createElement(
      'div',
      'lots-summary-card'
    );

    card.append(
      createElement('span', 'summary-label', label),
      createElement('strong', 'summary-value', value)
    );

    container.append(card);
  });
}

// ========================================
// Table Rendering
// ========================================

function renderTable(tbody, lots) {
  tbody.replaceChildren();

  if (!lots.length) {
    const row = createElement('tr');
    const cell = createElement(
      'td',
      'empty-state',
      'No purchase lots found.'
    );

    cell.colSpan = 8;

    row.append(cell);
    tbody.append(row);

    return;
  }

  lots.forEach(lot => {
    const row = createElement('tr', 'lot-row');

    if (lot.productId) {
      row.dataset.productId = lot.productId;

      if (lot.id) {
        row.dataset.lotId = lot.id;
      }

      row.tabIndex = 0;
      row.setAttribute(
        'aria-label',
        `Open product ${lot.productName}`
      );
    }

    const values = [
      lot.lotNumber,
      lot.productName,
      formatDate(lot.purchaseDate),
      lot.supplier,
      formatNumber(lot.totalQuantity),
      formatNumber(lot.remainingQuantity)
    ];

    values.forEach((value, index) => {
      const cell = createElement('td');

      if (index === 1) {
        cell.append(
          createElement(
            'strong',
            'lot-product-name',
            value
          )
        );
      } else {
        cell.textContent = String(value);
      }

      row.append(cell);
    });

    const statusCell = createElement('td');

    const badge = createElement(
      'span',
      `lot-status-badge ${getStatusClass(lot.status)}`,
      getStatusLabel(lot.status)
    );

    statusCell.append(badge);
    row.append(statusCell);

    const actionCell = createElement('td');

    const openButton = createElement(
      'button',
      'btn btn-sm btn-primary',
      'View Product'
    );

    openButton.type = 'button';
    openButton.dataset.action = 'open-product';

    if (lot.productId) {
      openButton.dataset.productId = lot.productId;

      if (lot.id) {
        openButton.dataset.lotId = lot.id;
      }
    } else {
      openButton.disabled = true;
      openButton.title = 'Product ID is missing.';
    }

    actionCell.append(openButton);
    row.append(actionCell);

    tbody.append(row);
  });
}

// ========================================
// Filtering
// ========================================

function filterLots(lots, searchValue, statusValue) {
  const search = String(searchValue || '')
    .trim()
    .toLowerCase();

  return lots.filter(lot => {
    const matchesSearch = !search || [
      lot.lotNumber,
      lot.productName,
      lot.supplier,
      lot.productId
    ].some(value =>
      String(value || '')
        .toLowerCase()
        .includes(search)
    );

    const matchesStatus =
      statusValue === 'all' ||
      normalizeStatus(lot.status) === statusValue;

    return matchesSearch && matchesStatus;
  });
}

// ========================================
// Loading / Error
// ========================================

function showMessage(container, message, type = '') {
  container.textContent = message;
  container.className = `lots-message ${type}`.trim();
}

function setLoading(button, loading) {
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading ? 'Loading...' : 'Refresh';
}

// ========================================
// Page State
// ========================================

let pageRoot = null;
let allLots = [];
let currentSignal = null;

// ========================================
// Load Lots
// ========================================

async function loadLots() {
  if (!pageRoot) return;

  const tbody = pageRoot.querySelector('#lots-table-body');
  const summary = pageRoot.querySelector('#lots-summary');
  const message = pageRoot.querySelector('#lots-message');
  const refreshButton = pageRoot.querySelector('#lots-refresh');

  setLoading(refreshButton, true);

  showMessage(message, 'Loading purchase lots...', 'loading');

  try {
    const rawLots = await fetchLots(currentSignal);

    if (currentSignal?.aborted) return;

    allLots = rawLots.map(normalizeLot);

    renderSummary(summary, allLots);
    applyFilters();

    showMessage(
      message,
      `${allLots.length} purchase lot(s) loaded.`,
      'success'
    );

  } catch (error) {
    if (
      error.name === 'AbortError' ||
      currentSignal?.aborted
    ) {
      return;
    }

    console.error('[PURCHASE LOTS]', error);

    allLots = [];

    renderSummary(summary, []);
    renderTable(tbody, []);

    showMessage(
      message,
      error.message || 'Unable to load purchase lots.',
      'error'
    );

  } finally {
    if (!currentSignal?.aborted) {
      setLoading(refreshButton, false);
    }
  }
}

// ========================================
// Apply Filters
// ========================================

function applyFilters() {
  if (!pageRoot) return;

  const search = pageRoot.querySelector('#lots-search');
  const status = pageRoot.querySelector('#lots-status-filter');
  const tbody = pageRoot.querySelector('#lots-table-body');

  const filteredLots = filterLots(
    allLots,
    search.value,
    status.value
  );

  renderTable(tbody, filteredLots);
}

// ========================================
// Open Product
// ========================================

function openProduct(productId, lotId) {
  if (!productId) return;

  navigateTo('products', {
    productId,
    lotId: lotId || null,
    source: 'purchase-lots'
  });
}

// ========================================
// Bind Events
// ========================================

export function bindEvents({ container, signal }) {
  pageRoot = container.querySelector('.purchase-lots-page');
  currentSignal = signal;

  if (!pageRoot) return;

  const search = pageRoot.querySelector('#lots-search');
  const status = pageRoot.querySelector('#lots-status-filter');
  const refresh = pageRoot.querySelector('#lots-refresh');
  const tbody = pageRoot.querySelector('#lots-table-body');

  search.addEventListener('input', applyFilters, { signal });

  status.addEventListener('change', applyFilters, { signal });

  refresh.addEventListener('click', loadLots, { signal });

  tbody.addEventListener('click', event => {
    const button = event.target.closest(
      '[data-action="open-product"]'
    );

    if (button) {
      openProduct(
        button.dataset.productId,
        button.dataset.lotId
      );

      return;
    }

    const row = event.target.closest('[data-product-id]');

    if (row && tbody.contains(row)) {
      openProduct(
        row.dataset.productId,
        row.dataset.lotId
      );
    }
  }, { signal });

  tbody.addEventListener('keydown', event => {
    if (
      event.key !== 'Enter' &&
      event.key !== ' '
    ) {
      return;
    }

    const row = event.target.closest('[data-product-id]');

    if (!row || !tbody.contains(row)) return;

    event.preventDefault();

    openProduct(
      row.dataset.productId,
      row.dataset.lotId
    );
  }, { signal });
}

// ========================================
// Render
// ========================================

export async function render({ signal }) {
  const page = createPage();

  pageRoot = page;
  currentSignal = signal;
  allLots = [];

  // Load data before returning the page.
  try {
    const rawLots = await fetchLots(signal);

    if (signal?.aborted) {
      return page;
    }

    allLots = rawLots.map(normalizeLot);

    renderSummary(
      page.querySelector('#lots-summary'),
      allLots
    );

    renderTable(
      page.querySelector('#lots-table-body'),
      allLots
    );

    showMessage(
      page.querySelector('#lots-message'),
      `${allLots.length} purchase lot(s) loaded.`,
      'success'
    );

  } catch (error) {
    if (error.name === 'AbortError' || signal?.aborted) {
      return page;
    }

    console.error('[PURCHASE LOTS]', error);

    renderSummary(
      page.querySelector('#lots-summary'),
      []
    );

    showMessage(
      page.querySelector('#lots-message'),
      error.message || 'Unable to load purchase lots.',
      'error'
    );
  }

  return page;
}

// ========================================
// Cleanup
// ========================================

export function cleanup() {
  pageRoot = null;
  allLots = [];
  currentSignal = null;
}

export default {
  render,
  bindEvents,
  cleanup
};
