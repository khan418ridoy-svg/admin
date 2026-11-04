function buildCatalogItem(id, p) {
  const variants = Object.values(p.variants || {}).filter(v => v && v.isActive !== false);
  const stocked = variants.filter(v => Number(v.stock) > 0);
  const colors = [...new Set(stocked.map(v => String(v.color || '').trim()).filter(Boolean))];
  const sizes = [...new Set(stocked.map(v => String(v.size || '').trim()).filter(Boolean))];
  const prices = variants.map(v => Number(v.sellingPrice) > 0 ? Number(v.sellingPrice) : Number(p.baseSellingPrice) || 0).filter(v => v > 0);
  const regularPrices = variants.map(v => Number(v.regularPrice) > 0 ? Number(v.regularPrice) : Number(p.baseRegularPrice) || 0).filter(v => v > 0);
  const sellingPrice = prices.length ? Math.min(...prices) : Number(p.baseSellingPrice) || 0;
  const regularPrice = regularPrices.length ? Math.min(...regularPrices) : Number(p.baseRegularPrice) || 0;
  const totalStock = variants.reduce((n, v) => n + Math.max(0, Number(v.stock) || 0), 0);
  const paths = p.categoryPaths || [];
  const collectionNames = [...new Set(paths.map(x => x.collectionName).filter(Boolean))];
  const categoryNames = [...new Set(paths.map(x => x.categoryName).filter(Boolean))];
  const subCategoryNames = [...new Set(paths.map(x => x.subCategoryName).filter(Boolean))];
  const variantSkus = [...new Set(Object.entries(p.variants || {}).flatMap(([sku, v]) => [sku, v?.variantSku]).filter(Boolean))];
  return {
    id, name: p.name || '', slug: p.slug || '', shortCode: p.shortCode || '', sku: p.sku || '',
    variantSkus, brand: p.brand || 'Nishat Fashion',
    sellingPrice, price: sellingPrice, minPrice: sellingPrice, maxPrice: prices.length ? Math.max(...prices) : sellingPrice,
    variantSellingPrices: prices, regularPrice,
    discountPercent: regularPrice > 0 ? Math.max(0, Math.round((regularPrice - sellingPrice) / regularPrice * 100)) : 0,
    colors, sizes, availableColors: colors, availableSizes: sizes,
    fabricType: p.fabricType || p.fabric || '', fit: p.fit || '', sleeveType: p.sleeveType || '',
    description: p.description || '', shortDescription: p.shortDescription || '',
    tags: Array.isArray(p.tags) ? p.tags : [],
    categoryPaths: paths, categories: paths,
    collectionName: collectionNames.join(' '), categoryName: categoryNames.join(' '), subCategoryName: subCategoryNames.join(' '),
    collectionIds: [...new Set(paths.map(x => x.collectionId).filter(Boolean))],
    categoryIds: [...new Set(paths.map(x => x.categoryId).filter(Boolean))],
    subCategoryIds: [...new Set(paths.map(x => x.subCategoryId).filter(Boolean))],
    totalStock, inStock: totalStock > 0, stockStatus: totalStock <= 0 ? 'out_of_stock' : totalStock <= Number(p.lowStockAlert || 5) ? 'low_stock' : 'in_stock',
    status: p.status || 'draft', mainImage: p.mainImage || ''
  };
}
module.exports = { buildCatalogItem };