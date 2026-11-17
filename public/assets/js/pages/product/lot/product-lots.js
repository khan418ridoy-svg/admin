
'use strict';

// ========================================
// PRODUCT LOTS
// Display All Stock Lots
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
  apiUrl: '/api/products',
  container: '#product-lots-container',
  search: '#product-lot-search',
  statusFilter: '#product-lot-status-filter',
  refreshButton: '#product-lot-refresh',
  emptyMessage: 'এই Product-এর কোনো Stock Lot পাওয়া যায়নি।'
};


// ========================================
// MODULE STATE
// ========================================

let initialized = false;
let currentProductId = null;
let lots = [];


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    container: getProductElement(CONFIG.container),
    search: getProductElement(CONFIG.search),
    statusFilter: getProductElement(CONFIG.statusFilter),
    refreshButton: getProductElement(CONFIG.refreshButton)
  };
}


// ========================================
// NORMALIZE LOT
// ========================================

function normalizeLot(data = {}) {
  return {
    id: String(data.id || data.lotId || ''),
    lotNumber: String(
      data.lotNumber || data.lotCode || data.id || ''
    ),
    purchaseDate: data.purchaseDate || data.createdAt || null,
    supplier: String(data.supplier || ''),
    totalQuantity: Math.max(
      0,
      Number(data.totalQuantity ?? data.quantity ?? 0)
    ),
    remainingQuantity: Math.max(
      0,
      Number(data.remainingQuantity ?? data.availableQuantity ?? 0)
    ),
    status: String(data.status || 'active').toLowerCase(),
    createdAt: data.createdAt || null
  };
}


// ========================================
// FORMAT DATE
// ========================================

function formatLotDate(value) {
  if (!value) return '—';

  let date;

  if (typeof value === 'object' && value.seconds) {
    date = new Date(value.seconds * 1000);
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-BD', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}


// ========================================
// GET LOT STATUS
// ========================================

function getLotStatus(lot) {
  if (lot.status === 'cancelled') return 'Cancelled';
  if (lot.status === 'closed') return 'Closed';
  if (lot.status === 'draft') return 'Draft';

  if (lot.remainingQuantity <= 0) {
    return 'Depleted';
  }

  return 'Active';
}


// ========================================
// GET STATUS CLASS
// ========================================

function getLotStatusClass(status) {
  const classes = {
    Active: 'active',
    Depleted: 'depleted',
    Closed: 'closed',
    Cancelled: 'cancelled',
    Draft: 'draft'
  };

  return classes[status] || 'unknown';
}


// ========================================
// FILTER LOTS
// ========================================

function getFilteredLots() {
  const elements = getElements();

  const search = elements.search?.value
    .trim()
    .toLowerCase() || '';

  const status = elements.statusFilter?.value || 'all';

  return lots.filter(lot => {
    const matchesSearch = [
      lot.id,
      lot.lotNumber,
      lot.supplier
    ].some(value =>
      value.toLowerCase().includes(search)
    );

    const lotStatus = getLotStatus(lot).toLowerCase();

    const matchesStatus =
      status === 'all' ||
      lotStatus === status.toLowerCase();

    return matchesSearch && matchesStatus;
  });
}


// ========================================
// RENDER LOT ROW
// ========================================

function createLotRow(lot) {
  const status = getLotStatus(lot);
  const statusClass = getLotStatusClass(status);

  const row = document.createElement('tr');

  row.innerHTML = `
    <td>
      <strong>${escapeProductHTML(lot.lotNumber)}</strong>
    </td>

    <td>
      ${escapeProductHTML(formatLotDate(lot.purchaseDate))}
    </td>

    <td>
      ${escapeProductHTML(lot.supplier || '—')}
    </td>

    <td>
      ${lot.totalQuantity}
    </td>

    <td>
      <strong>${lot.remainingQuantity}</strong>
    </td>

    <td>
      <span class="lot-status lot-status-${statusClass}">
        ${escapeProductHTML(status)}
      </span>
    </td>

    <td>
      <button
        type="button"
        class="btn btn-sm btn-outline-primary"
        data-lot-action="history"
        data-lot-id="${escapeProductHTML(lot.id)}"
      >
        History
      </button>
    </td>
  `;

  return row;
}


// ========================================
// RENDER LOTS
// ========================================

export function renderProductLots() {
  const elements = getElements();

  if (!elements.container) return;

  const filteredLots = getFilteredLots();

  elements.container.replaceChildren();

  if (!filteredLots.length) {
    const empty = document.createElement('div');

    empty.className = 'product-lots-empty';
    empty.textContent = CONFIG.emptyMessage;

    elements.container.appendChild(empty);

    return;
  }

  const table = document.createElement('table');

  table.className = 'product-lots-table';

  table.innerHTML = `
    <thead>
      <tr>
        <th>Lot Number</th>
        <th>Purchase Date</th>
        <th>Supplier</th>
        <th>Total Qty</th>
        <th>Remaining Qty</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  filteredLots.forEach(lot => {
    tbody.appendChild(createLotRow(lot));
  });

  table.appendChild(tbody);
  elements.container.appendChild(table);
}


// ========================================
// SET LOT DATA
// ========================================

export function setProductLots(data = []) {
  if (!Array.isArray(data)) {
    console.error('[PRODUCT LOTS] Invalid lot data.');
    return;
  }

  lots = data.map(normalizeLot);

  renderProductLots();
}


// ========================================
// GET LOT DATA
// ========================================

export function getProductLots() {
  return lots.map(lot => ({ ...lot }));
}


// ========================================
// LOAD PRODUCT LOTS
// ========================================

export async function loadProductLots(productId) {
  if (!productId) {
    throw new Error('Product ID পাওয়া যায়নি।');
  }

  currentProductId = productId;

  const elements = getElements();

  if (elements.container) {
    elements.container.textContent = 'Loading Stock Lots...';
  }

  const result = await productApiRequest(
    `${CONFIG.apiUrl}/${encodeURIComponent(productId)}/lots`,
    {
      method: 'GET'
    }
  );

  const data = result.data;

  const lotList = Array.isArray(data)
    ? data
    : Array.isArray(data?.lots)
      ? data.lots
      : [];

  setProductLots(lotList);

  return lots;
}


// ========================================
// REFRESH LOTS
// ========================================

export async function refreshProductLots(productId = currentProductId) {
  if (!productId) return false;

  try {
    await loadProductLots(productId);
    return true;

  } catch (error) {
    console.error('[PRODUCT LOTS]', error);

    showProductMessage(
      error.message || 'Stock Lots Refresh করা যায়নি।',
      'error'
    );

    return false;
  }
}


// ========================================
// OPEN LOT HISTORY
// ========================================

function handleLotAction(event) {
  const button = event.target.closest(
    '[data-lot-action="history"]'
  );

  if (!button) return;

  const lotId = button.dataset.lotId;

  if (!lotId || !currentProductId) return;

  document.dispatchEvent(
    new CustomEvent('product:lot-history', {
      detail: {
        productId: currentProductId,
        lotId
      }
    })
  );
}


// ========================================
// BIND EVENTS
// ========================================

function bindEvents() {
  const elements = getElements();

  elements.search?.addEventListener('input', renderProductLots);

  elements.statusFilter?.addEventListener(
    'change',
    renderProductLots
  );

  elements.refreshButton?.addEventListener('click', () => {
    refreshProductLots();
  });

  elements.container?.addEventListener(
    'click',
    handleLotAction
  );
}


// ========================================
// RESET LOTS
// ========================================

export function resetProductLots() {
  lots = [];
  currentProductId = null;

  const elements = getElements();

  if (elements.search) elements.search.value = '';

  if (elements.statusFilter) {
    elements.statusFilter.value = 'all';
  }

  if (elements.container) {
    elements.container.replaceChildren();
  }
}


// ========================================
// INITIALIZE
// ========================================

export function initProductLots() {
  if (initialized) return;

  const elements = getElements();

  if (!elements.container) {
    console.warn('[PRODUCT LOTS] Container not found.');
    return;
  }

  bindEvents();

  initialized = true;
}

export default initProductLots;
