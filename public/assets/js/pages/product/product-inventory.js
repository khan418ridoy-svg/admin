
'use strict';

// ========================================
// PRODUCT INVENTORY
// Inventory Summary & Stock Status
// ========================================

import {
  getProductElement,
  showProductMessage
} from './product-utils.js';


// ========================================
// STATE
// ========================================

let inventoryData = {
  totalStock: 0,
  availableStock: 0,
  lowStockCount: 0,
  stockStatus: 'out_of_stock',
  hasLowStock: false,
  variants: []
};

let initialized = false;


// ========================================
// SELECTORS
// ========================================

const SELECTORS = {
  container: '#product-inventory-container',
  totalStock: '#product-total-stock',
  availableStock: '#product-available-stock',
  lowStockCount: '#product-low-stock-count',
  stockStatus: '#product-stock-status',
  hasLowStock: '#product-has-low-stock'
};


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    container: getProductElement(SELECTORS.container),
    totalStock: getProductElement(SELECTORS.totalStock),
    availableStock: getProductElement(SELECTORS.availableStock),
    lowStockCount: getProductElement(SELECTORS.lowStockCount),
    stockStatus: getProductElement(SELECTORS.stockStatus),
    hasLowStock: getProductElement(SELECTORS.hasLowStock)
  };
}


// ========================================
// NORMALIZE NUMBER
// ========================================

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}


// ========================================
// GET STOCK STATUS
// ========================================

export function getProductStockStatus(totalStock, lowStockCount = 0) {
  const stock = toNumber(totalStock);
  const lowCount = toNumber(lowStockCount);

  if (stock <= 0) {
    return 'out_of_stock';
  }

  if (lowCount > 0) {
    return 'low_stock';
  }

  return 'in_stock';
}


// ========================================
// GET STOCK STATUS LABEL
// ========================================

function getStockStatusLabel(status) {
  const labels = {
    in_stock: 'In Stock',
    low_stock: 'Low Stock',
    out_of_stock: 'Out of Stock'
  };

  return labels[status] || 'Unknown';
}


// ========================================
// RENDER INVENTORY SUMMARY
// ========================================

function renderInventorySummary() {
  const elements = getElements();

  if (elements.totalStock) {
    elements.totalStock.value = inventoryData.totalStock;
  }

  if (elements.availableStock) {
    elements.availableStock.value = inventoryData.availableStock;
  }

  if (elements.lowStockCount) {
    elements.lowStockCount.value = inventoryData.lowStockCount;
  }

  if (elements.stockStatus) {
    elements.stockStatus.value = inventoryData.stockStatus;
    elements.stockStatus.textContent =
      getStockStatusLabel(inventoryData.stockStatus);
  }

  if (elements.hasLowStock) {
    elements.hasLowStock.checked = inventoryData.hasLowStock;
  }
}


// ========================================
// SET INVENTORY DATA
// Backend Data / Edit Product
// ========================================

export function setProductInventoryData(data = {}) {
  inventoryData = {
    totalStock: toNumber(data.totalStock),
    availableStock: toNumber(
      data.availableStock ?? data.totalStock
    ),
    lowStockCount: toNumber(data.lowStockCount),
    stockStatus: data.stockStatus || 'out_of_stock',
    hasLowStock: data.hasLowStock === true,
    variants: Array.isArray(data.variants)
      ? data.variants.map(variant => ({
          variantSku: variant.variantSku || '',
          color: variant.color || '',
          size: variant.size || '',
          stock: toNumber(variant.stock),
          lowStockAlert: toNumber(variant.lowStockAlert)
        }))
      : []
  };

  renderInventorySummary();
}


// ========================================
// GET INVENTORY DATA
// ========================================

export function getProductInventoryData() {
  return {
    totalStock: inventoryData.totalStock,
    availableStock: inventoryData.availableStock,
    lowStockCount: inventoryData.lowStockCount,
    stockStatus: inventoryData.stockStatus,
    hasLowStock: inventoryData.hasLowStock
  };
}


// ========================================
// VALIDATE INVENTORY
// ========================================

export function validateProductInventory() {
  if (inventoryData.totalStock < 0) {
    showProductMessage(
      'Total Stock সঠিক নয়।',
      'warning'
    );

    return false;
  }

  if (inventoryData.availableStock < 0) {
    showProductMessage(
      'Available Stock সঠিক নয়।',
      'warning'
    );

    return false;
  }

  return true;
}


// ========================================
// RESET INVENTORY
// ========================================

export function resetProductInventory() {
  inventoryData = {
    totalStock: 0,
    availableStock: 0,
    lowStockCount: 0,
    stockStatus: 'out_of_stock',
    hasLowStock: false,
    variants: []
  };

  renderInventorySummary();
}


// ========================================
// REFRESH INVENTORY FROM BACKEND
// ========================================

export async function refreshProductInventory(productId) {
  if (!productId) {
    showProductMessage(
      'Product ID পাওয়া যায়নি।',
      'error'
    );

    return false;
  }

  try {
    const response = await fetch(
      `/api/products/${encodeURIComponent(productId)}/inventory`,
      {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Inventory request failed: ${response.status}`);
    }

    const result = await response.json();

    if (result.success === false) {
      throw new Error(
        result.message || 'Inventory load failed'
      );
    }

    setProductInventoryData(result.data || result);

    return true;

  } catch (error) {
    console.error('[PRODUCT INVENTORY]', error);

    showProductMessage(
      'Inventory information load করা যায়নি।',
      'error'
    );

    return false;
  }
}


// ========================================
// INITIALIZE
// ========================================

export function initProductInventory() {
  if (initialized) return;

  const { container } = getElements();

  if (!container) {
    console.warn(
      '[PRODUCT INVENTORY] Inventory container not found.'
    );

    return;
  }

  initialized = true;

  renderInventorySummary();
}


// ========================================
// DEFAULT EXPORT
// ========================================

export default initProductInventory;
