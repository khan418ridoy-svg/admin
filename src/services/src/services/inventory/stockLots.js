function ensureStockLots(product, productId) {
  const lots = Array.isArray(product.stockLots) ? product.stockLots.map(x => ({
    ...x, quantities: { ...(x.quantities || {}) }
  })) : [];
  if (lots.length) return lots;
  const opening = {};
  for (const [sku, variant] of Object.entries(product.variants || {})) {
    const qty = Math.max(0, Math.floor(Number(variant.stock) || 0));
    if (qty) opening[sku] = qty;
  }
  if (Object.keys(opening).length) {
    lots.push({
      lotId: product.lotId ? String(product.lotId) : `opening-${productId}`,
      lotNo: product.lotId ? String(product.lotId) : 'OPENING',
      createdAt: 0,
      note: 'Automatically migrated from existing product stock',
      quantities: opening
    });
  }
  return lots;
}

function allocateStock(product, productId, variantSku, qty) {
  const lots = ensureStockLots(product, productId);
  let remaining = qty;
  const allocations = [];
  const ordered = [...lots].sort((a, b) =>
    Number(a.createdAt || 0) - Number(b.createdAt || 0) ||
    String(a.lotNo || '').localeCompare(String(b.lotNo || ''))
  );
  for (const lot of ordered) {
    const available = Math.max(0, Math.floor(Number(lot.quantities?.[variantSku]) || 0));
    if (!available || !remaining) continue;
    const take = Math.min(available, remaining);
    lot.quantities[variantSku] = available - take;
    allocations.push({ lotId: lot.lotId, lotNo: lot.lotNo, qty: take });
    remaining -= take;
  }
  if (remaining > 0) throw new Error('out_of_stock');
  return { stockLots: lots, allocations };
}

function restoreAllocations(product, productId, variantSku, allocations) {
  const lots = ensureStockLots(product, productId);
  for (const allocation of allocations || []) {
    const lotId = String(allocation.lotId || '');
    let lot = lots.find(x => String(x.lotId) === lotId);
    if (!lot) {
      lot = {
        lotId: lotId || `opening-${productId}`,
        lotNo: allocation.lotNo || 'OPENING',
        createdAt: Number(allocation.createdAt || 0),
        quantities: {}
      };
      lots.push(lot);
    }
    lot.quantities[variantSku] = Math.max(0, Number(lot.quantities[variantSku]) || 0) +
      Math.max(0, Math.floor(Number(allocation.qty) || 0));
  }
  return lots;
}

function syncVariantTotals(product, stockLots) {
  const variants = { ...(product.variants || {}) };
  for (const [sku, variant] of Object.entries(variants)) {
    const stock = (stockLots || []).reduce((sum, lot) =>
      sum + Math.max(0, Math.floor(Number(lot.quantities?.[sku]) || 0)), 0);
    variants[sku] = { ...variant, stock };
  }
  return variants;
}

module.exports = { ensureStockLots, allocateStock, restoreAllocations, syncVariantTotals };
