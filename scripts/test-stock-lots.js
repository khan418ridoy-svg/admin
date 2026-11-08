const assert = require('node:assert/strict');
const {
  ensureStockLots, allocateStock, restoreAllocations, syncVariantTotals
} = require('../src/services/inventory/stockLots');

const product = {
  lotId: 'LOT-001',
  variants: {
    'SHIRT-RED-M': { color: 'Red', size: 'M', stock: 500 },
    'SHIRT-WHITE-M': { color: 'White', size: 'M', stock: 100 }
  }
};

product.stockLots = ensureStockLots(product, 'product-1');
product.stockLots.push({
  lotId: 'LOT-002', lotNo: 'LOT-002', createdAt: Date.now(),
  quantities: { 'SHIRT-RED-M': 400, 'SHIRT-WHITE-M': 300 }
});
product.variants = syncVariantTotals(product, product.stockLots);

const sale = allocateStock(product, 'product-1', 'SHIRT-RED-M', 550);
assert.deepEqual(sale.allocations.map(x => [x.lotNo, x.qty]), [['LOT-001', 500], ['LOT-002', 50]]);
product.stockLots = sale.stockLots;
product.variants = syncVariantTotals(product, product.stockLots);
assert.equal(product.variants['SHIRT-RED-M'].stock, 350);
assert.equal(product.variants['SHIRT-WHITE-M'].stock, 400);

product.stockLots = restoreAllocations(product, 'product-1', 'SHIRT-RED-M', sale.allocations);
product.variants = syncVariantTotals(product, product.stockLots);
assert.equal(product.variants['SHIRT-RED-M'].stock, 900);

assert.throws(() => allocateStock(product, 'product-1', 'SHIRT-WHITE-M', 401), /out_of_stock/);
console.log('PASS: FIFO allocation, variant isolation, and exact stock restoration');
