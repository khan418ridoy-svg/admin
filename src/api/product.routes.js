const router = require('express').Router();
const crypto = require('crypto');
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const { db, FieldValue } = require('../config/firebase');
const { buildCatalogItem } = require('../services/catalog/toItem');
const productCache = require('../services/catalog/productCache');
const { ensureStockLots, syncVariantTotals } = require('../services/inventory/stockLots');
const {
  cleanBarcode,
  barcodeDocRef,
  buildVariantSku,
  assertUniqueVariantBarcodes,
  syncBarcodeRegistry
} = require('../services/products/barcode');

const costStore = require('../services/products/costStore');
const { allocateProductCode } = require('../services/products/productCode');
const { REQUIRE_REVIEW_FOR_ACTIVE, activationBlocker, needsActivationCheck } = require('../services/products/activationGate');

router.use(adminAuth);

const slugify = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function uniqueSlug(base, id) {
  let slug = base || 'product';
  let n = 1;
  while (true) {
    const q = await db.collection('products').where('slug', '==', slug).limit(2).get();
    if (q.docs.every(d => d.id === id)) return slug;
    slug = `${base || 'product'}-${++n}`;
  }
}

function summarize(data) {
  const variants = data.variants || {};
  const all = Object.values(variants);
  const active = all.filter(v => v.isActive !== false);
  const stockVariants = active.filter(v => Number(v.stock) > 0);
  const totalStock = all.reduce((n, v) => n + Math.max(0, Number(v.stock) || 0), 0);
  const baseRegular = Math.max(0, Number(data.baseRegularPrice) || 0);
  const baseSelling = Math.max(0, Number(data.baseSellingPrice) || 0);
  const effective = active.map(v => ({
    ...v,
    regularPrice: Number(v.regularPrice) > 0 ? Number(v.regularPrice) : baseRegular,
    sellingPrice: Number(v.sellingPrice) > 0 ? Number(v.sellingPrice) : baseSelling
  }));
  const cheapest = effective.filter(v => v.sellingPrice > 0).sort((a, b) => a.sellingPrice - b.sellingPrice)[0];
  const prices = effective.map(v => Number(v.sellingPrice) || 0).filter(v => v > 0);
  const low = active.filter(v => Number(v.stock || 0) <= Number(v.lowStockAlert ?? 5));
  const paths = Array.isArray(data.categoryPaths) ? data.categoryPaths : [];
  const regular = Number(cheapest?.regularPrice || baseRegular);
  const selling = Number(cheapest?.sellingPrice || baseSelling);
  const discount = regular > 0 ? Math.max(0, Math.round((regular - selling) / regular * 100)) : 0;
  
  return {
    ...data,
    regularPrice: regular,
    sellingPrice: selling,
    minPrice: selling,
    discountPercent: discount,
    hasVariantPriceRange: new Set(prices).size > 1,
    totalStock,
    stockStatus: totalStock === 0 ? 'out_of_stock' : low.length ? 'low_stock' : 'in_stock',
    availableSizes: [...new Set(stockVariants.map(v => v.size).filter(Boolean))],
    availableColors: [...new Set(stockVariants.map(v => v.color).filter(Boolean))],
    hasLowStock: low.length > 0,
    lowStockCount: low.length,
    categoryPaths: paths,
    collectionIds: [...new Set(paths.map(x => x.collectionId).filter(Boolean))],
    categoryIds: [...new Set(paths.map(x => x.categoryId).filter(Boolean))],
    subCategoryIds: [...new Set(paths.map(x => x.subCategoryId).filter(Boolean))]
  };
}

async function mapTaxonomy(paths) {
  const snap = await db.doc('meta/taxonomy').get();
  const cols = snap.data()?.collections || [];
  return paths.map(p => {
    const c = cols.find(x => x.id === p.collectionId);
    const k = c?.categories?.find(x => x.id === p.categoryId);
    const s = k?.subCategories?.find(x => x.id === p.subCategoryId);
    if (!c || !k || (p.subCategoryId && !s)) throw Object.assign(new Error('invalid_category_path'), { status: 400 });
    return { ...p, collectionName: c.name, categoryName: k.name, subCategoryName: s?.name || '' };
  });
}



function normalizeVariants(
  input,
  old = {},
  isCreate = false,
  baseRegularPrice = 0,
  baseSellingPrice = 0,
  productSku = ''
) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(
      new Error('variants_must_be_map'),
      { status: 400 }
    );
  }

  const out = {};

  for (const [inputSku, v0] of Object.entries(input)) {
    const v = { ...v0 };

    const color = String(v.color || '').trim();
    const size = String(v.size || '').trim();

    if (!color || !size) {
      throw Object.assign(
        new Error(`variant_color_size_required:${inputSku}`),
        { status: 400 }
      );
    }

    // Generate Variant SKU.
    const generatedSku = buildVariantSku(
      productSku,
      color,
      size
    );

    // Preserve existing SKU, but generate for pending/new variants.
    const sku = (
      !inputSku ||
      inputSku.startsWith('__pending_variant_')
    )
      ? generatedSku
      : String(v.variantSku || inputSku).trim().toUpperCase();

    if (!/^[A-Z0-9_-]{1,64}$/.test(sku)) {
      throw Object.assign(
        new Error('invalid_variant_sku'),
        { status: 400 }
      );
    }

    if (out[sku]) {
      throw Object.assign(
        new Error('duplicate_variant_color_size_or_sku'),
        { status: 409 }
      );
    }

    const prior = old[sku];

    const stock = prior
      ? Number(prior.stock || 0)
      : Math.max(0, Number(v.stock) || 0);

    // Manual Barcode থাকলে সেটি, না থাকলে Variant SKU.
    const barcode = cleanBarcode(v.barcode) || sku;

    const regularPrice = Math.max(
      0,
      Number(v.regularPrice) > 0
        ? Number(v.regularPrice)
        : Number(baseRegularPrice) || 0
    );

    const sellingPrice = Math.max(
      0,
      Number(v.sellingPrice) > 0
        ? Number(v.sellingPrice)
        : Number(baseSellingPrice) || 0
    );

    out[sku] = {
      color,
      size,
      variantSku: sku,
      barcode,

      regularPrice,
      sellingPrice,

      discountPercent: regularPrice > 0
        ? Math.max(
            0,
            Math.round(
              ((regularPrice - sellingPrice) / regularPrice) * 100
            )
          )
        : 0,

      stock,

      lowStockAlert: Math.max(
        0,
        Number(v.lowStockAlert ?? 5)
      ),

      isActive: v.isActive !== false
    };
  }

  // Preserve old variants that were not submitted.
  for (const [sku, v] of Object.entries(old || {})) {
    if (!out[sku]) {
      out[sku] = {
        ...v,
        variantSku: v.variantSku || sku,
        barcode: cleanBarcode(v.barcode) || sku,
        stock: Number(v.stock || 0)
      };
    }
  }

  return out;
}




async function save(req, res, isCreate) {
  const data = req.body || {};

  if (!String(data.name || '').trim()) {
    return res.status(400).json({
      ok: false,
      error: 'name_required'
    });
  }

  const id = isCreate ? db.collection('products').doc().id : req.params.id;
  const ref = db.doc(`products/${id}`), oldSnap = await ref.get();
  if (!isCreate && !oldSnap.exists) return res.status(404).json({ ok: false, error: 'not_found' });
  const old = oldSnap.data() || {};
  


  // Product barcode: valid format + not used by another product.
// Product Barcode না থাকলে Product SKU ব্যবহার হবে
let barcode;

try {
  barcode = cleanBarcode(data.barcode);
} catch (e) {
  return res.status(e.status || 400).json({
    ok: false,
    error: e.message
  });
}

  
  let paths;
  try { paths = await mapTaxonomy(Array.isArray(data.categoryPaths) ? data.categoryPaths : []); }
  catch (e) { return res.status(e.status || 400).json({ ok: false, error: e.message }); }
  if (!paths.length) return res.status(400).json({ ok: false, error: 'at_least_one_category_required' });
  
// Product Code এবং Product SKU আগে তৈরি হবে
const shortCode = old.shortCode || await allocateProductCode(id);

const sku = String(
  data.sku || old.sku || `NF-${shortCode}`
)
  .trim()
  .toUpperCase();

if (!sku || !/^[A-Z0-9_-]{1,64}$/.test(sku)) {
  return res.status(400).json({
    ok: false,
    error: 'invalid_or_empty_product_sku'
  });
}

// Product Barcode Auto Generate
if (!barcode) {
  barcode = sku;
}

// Auto-generated এবং manual উভয় Barcode-এর duplicate check


// Duplicate SKU যাচাই
const dup = await db.collection('products')
  .where('sku', '==', sku)
  .limit(2)
  .get();

if (dup.docs.some(d => d.id !== id)) {
  return res.status(409).json({
    ok: false,
    error: 'duplicate_sku'
  });
}

// Product Code অন্য Product ব্যবহার করছে কি না
const codeRef = await db.doc(`shortCodes/${shortCode}`).get();

if (codeRef.exists && codeRef.data()?.productId !== id) {
  return res.status(409).json({
    ok: false,
    error: 'duplicate_short_code'
  });
}

  const baseRegularPrice = Math.max(0, Number(data.baseRegularPrice) || 0), baseSellingPrice = Math.max(0, Number(data.baseSellingPrice) || 0);
  if (baseRegularPrice > 0 && baseSellingPrice > baseRegularPrice) return res.status(400).json({ ok: false, error: 'default_selling_price_cannot_exceed_regular_price' });
  
let variants;

try {
  variants = normalizeVariants(
    data.variants,
    old.variants || {},
    isCreate,
    baseRegularPrice,
    baseSellingPrice,
    sku
  );

assertUniqueVariantBarcodes(variants, barcode);



  
} catch (e) {
  return res.status(e.status || 400).json({
    ok: false,
    error: e.message
  });
}
  if (!Object.keys(variants).length) return res.status(400).json({ ok: false, error: 'at_least_one_variant_required' });
  
  const images = Array.isArray(data.images) ? data.images.filter(x => x && x.url).slice(0, 12) : [];
  if (data.status === 'active' && images.length < 3) return res.status(400).json({ ok: false, error: 'active_product_requires_minimum_3_images' });

  // Saving resets the review mark, so a product can't jump to active straight from the form:
  // save as draft -> View -> OK mark -> Active (dropdown or bulk).
  const nextStatus = ['active', 'inactive', 'draft'].includes(data.status) ? data.status : 'draft';
  if (REQUIRE_REVIEW_FOR_ACTIVE && needsActivationCheck(old.status, nextStatus)) {
    return res.status(409).json({ ok: false, error: 'review_not_ok' });
  }
const slug = old.slug || await uniqueSlug(slugify(data.name), id);
const now = Date.now(), first = paths[0];



  const final = {
    ...old, ...data, id: undefined, slug, sku, shortCode, barcode,
    brand: String(data.brand || 'Nishat Fashion'),
    status: nextStatus,
    lotId: data.lotId || null,
    baseRegularPrice, baseSellingPrice, categoryPaths: paths,
    collectionId: first.collectionId, collectionSlug: first.collectionId, categoryId: first.categoryId, subCategoryId: first.subCategoryId || null,
    collectionName: first.collectionName, categoryName: first.categoryName, subCategoryName: first.subCategoryName,
    tags: Array.isArray(data.tags) ? data.tags.map(String).slice(0, 30) : [],
    images, mainImage: data.mainImage || images[0]?.url || '', hoverImage: data.hoverImage || images[1]?.url || '',
    variants, createdAt: old.createdAt || now, updatedAt: now, createdBy: old.createdBy || req.user.uid,
    ratingAvg: Number(old.ratingAvg || 0), ratingCount: Number(old.ratingCount || 0),
    ratingBreakdown: old.ratingBreakdown || { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 },
    latestReviews: old.latestReviews || [], soldCount: Number(old.soldCount || 0),
    // Any edit means the product must be checked again (the client can never set this).
    review: { status: 'pending', at: now, by: req.user?.uid || null }
  };
  
  delete final.id; delete final.buyPrice; delete final.variantBuyPrice; delete final.supplier; delete final.purchaseNote; delete final.profitPerPiece; delete final.aiNotes;
  
  if (!final.metaTitle) final.metaTitle = String(final.name || '').slice(0, 60);
  if (!final.metaDescription) final.metaDescription = String(final.shortDescription || '').slice(0, 160);
  
  const result = summarize(final);
  result.cacheUpdatedAt = now;
  

// Product + Variant barcode claims.
const barcodeEntries = [
  {
    barcode,
    type: 'product'
  },

  ...Object.entries(variants).map(([variantSku, variant]) => ({
    barcode: variant.barcode || variantSku,
    type: 'variant',
    variantSku
  }))
];

// All product writes + barcode registry writes in one transaction.
await db.runTransaction(async tx => {
  const currentSnap = await tx.get(ref);

  if (isCreate && currentSnap.exists) {
    throw Object.assign(
      new Error('product_already_exists'),
      { status: 409 }
    );
  }

  if (!isCreate && !currentSnap.exists) {
    throw Object.assign(
      new Error('product_not_found'),
      { status: 404 }
    );
  }

  // Global duplicate checking and old claim cleanup.
  await syncBarcodeRegistry(tx, id, barcodeEntries);

  tx.set(ref, result);

  // Private purchase costs.
  costStore.addCostToBatch(tx, id, data, now);

  tx.set(
    db.doc('meta/catalog'),
    {
      items: {
        [id]: buildCatalogItem(id, result)
      },
      updatedAt: now
    },
    { merge: true }
  );

  tx.set(
    db.doc(`shortCodes/${shortCode}`),
    {
      productId: id,
      sku,
      updatedAt: now
    },
    { merge: true }
  );
});


  // Draft সেভ করলে ক্যাশে আপডেট হবে না
  const finalStatus = result.status || data.status || 'draft';
  if (finalStatus !== 'draft') {
    await productCache.recordChange(id, false);
  }
  
  return res.status(isCreate ? 201 : 200).json({ ok: true, id, shortCode, product: result });
}

router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  let q = db.collection('products').orderBy('updatedAt', 'desc').limit(limit);
  if (req.query.status) q = q.where('status', '==', req.query.status);
  const snap = await q.get();
  res.json({ ok: true, items: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
}));

// ---- Private costs: every product's cost in ONE read (for reports / profit pages) ----
router.get('/costs/all', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await costStore.readAllCosts()) });
}));

// One-time: copy old productCosts/{id} documents into meta/productCosts.
router.post('/costs/migrate', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await costStore.migrateLegacyCosts()) });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['active', 'inactive', 'draft'].includes(status)) return res.status(400).json({ ok: false, error: 'invalid_status' });
  const ref = db.doc(`products/${req.params.id}`), snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ ok: false, error: 'product_not_found' });
  if (needsActivationCheck(snap.data().status, status)) {
    const blocker = activationBlocker(snap.data());
    if (blocker) return res.status(409).json({ ok: false, error: blocker });
  }
  const updatedAt = Date.now(), next = { ...snap.data(), status, updatedAt }, batch = db.batch();
  batch.update(ref, { status, updatedAt });
  batch.set(db.doc('meta/catalog'), { items: { [req.params.id]: buildCatalogItem(req.params.id, next) }, updatedAt }, { merge: true });
  await batch.commit();
  await productCache.recordChange(req.params.id, false);
  res.json({ ok: true, id: req.params.id, status });
}));

// View popup: mark a product OK / Not OK / back to unchecked. Does not touch updatedAt or the catalog cache.
router.patch('/:id/review', asyncHandler(async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['ok', 'not_ok', 'pending'].includes(status)) return res.status(400).json({ ok: false, error: 'invalid_review_status' });
  const review = { status, at: Date.now(), by: req.user?.uid || null };
  try {
    await db.doc(`products/${req.params.id}`).update({ review });
  } catch (e) {
    if (e.code === 5) return res.status(404).json({ ok: false, error: 'product_not_found' });
    throw e;
  }
  res.json({ ok: true, id: req.params.id, review });
}));

router.patch('/bulk-status', asyncHandler(async (req, res) => {
  const { ids, status } = req.body || {};
  if (!['active', 'inactive', 'draft'].includes(status)) return res.status(400).json({ ok: false, error: 'invalid_status' });
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ ok: false, error: 'no_ids_provided' });
  const uniqueIds = [...new Set(ids.map(String))];
  if (uniqueIds.length > 400) return res.status(400).json({ ok: false, error: 'too_many_ids' });

  // One batched read for all selected products.
  const snaps = await db.getAll(...uniqueIds.map(id => db.doc(`products/${id}`)));
  const updatedAt = Date.now();
  const batch = db.batch();
  const catalogItems = {};
  const updated = [], skipped = [];

  for (const snap of snaps) {
    if (!snap.exists) { skipped.push({ id: snap.id, reason: 'product_not_found' }); continue; }
    const data = snap.data();
    if (needsActivationCheck(data.status, status)) {
      const blocker = activationBlocker(data);
      if (blocker) { skipped.push({ id: snap.id, reason: blocker }); continue; }
    }
    batch.update(snap.ref, { status, updatedAt });
    updated.push(snap.id);
    // ক্যাশে আপডেট (শুধু active/inactive হলে)
    if (status !== 'draft') catalogItems[snap.id] = buildCatalogItem(snap.id, { ...data, status, updatedAt });
  }

  if (!updated.length) return res.json({ ok: true, count: 0, status, updated, skipped });
  if (Object.keys(catalogItems).length) batch.set(db.doc('meta/catalog'), { items: catalogItems, updatedAt }, { merge: true });
  await batch.commit();

  if (status !== 'draft') {
    for (const id of updated) {
      await productCache.recordChange(id, false);
    }
  }

  res.json({ ok: true, count: updated.length, status, updated, skipped });
}));


router.get('/:id/stock', asyncHandler(async (req, res) => {
  const snap = await db.doc(`products/${req.params.id}`).get();
  if (!snap.exists) return res.status(404).json({ ok: false, error: 'product_not_found' });
  const product = snap.data() || {};
  const stockLots = ensureStockLots(product, snap.id);
  const lots = stockLots.map(lot => ({
    lotId: lot.lotId, lotNo: lot.lotNo, createdAt: lot.createdAt || 0,
    note: lot.note || '', quantities: lot.quantities || {}
  }));
  res.json({ ok: true, product: { id: snap.id, name: product.name, sku: product.sku, variants: product.variants || {} }, lots });
}));

router.post('/:id/stock', asyncHandler(async (req, res) => {
  const productRef = db.doc(`products/${req.params.id}`);
  const productSnap = await productRef.get();
  if (!productSnap.exists) return res.status(404).json({ ok: false, error: 'product_not_found' });
  const body = req.body || {};
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length || entries.length > 100) return res.status(400).json({ ok: false, error: 'stock_entries_required' });

  const mode = body.lotMode === 'existing' ? 'existing' : 'new';
  const lotNo = String(body.lotNo || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-').slice(0, 40);
  let lotRef;
  if (mode === 'existing') {
    if (!String(body.lotId || '').trim()) return res.status(400).json({ ok: false, error: 'lot_required' });
    lotRef = db.doc(`lots/${String(body.lotId).trim()}`);
  } else {
    if (!lotNo) return res.status(400).json({ ok: false, error: 'lot_no_required' });
    const duplicate = await db.collection('lots').where('lotNo', '==', lotNo).limit(1).get();
    if (!duplicate.empty) return res.status(409).json({ ok: false, error: 'lot_no_already_exists' });
    lotRef = db.doc(`lots/${lotNo}`);
  }

  const result = await db.runTransaction(async tx => {
    const [pSnap, lSnap, versionSnap] = await Promise.all([
      tx.get(productRef), tx.get(lotRef), tx.get(db.doc('meta/catalogVersion'))
    ]);
    if (!pSnap.exists) throw Object.assign(new Error('product_not_found'), { status: 404 });
    if (mode === 'existing' && !lSnap.exists) throw Object.assign(new Error('lot_not_found'), { status: 404 });
    if (mode === 'new' && lSnap.exists) throw Object.assign(new Error('lot_no_already_exists'), { status: 409 });
    const product = pSnap.data() || {};
    const variants = { ...(product.variants || {}) };
    let stockLots = ensureStockLots(product, pSnap.id);
    const added = [];

    const newBarcodeClaims = [];
const newBarcodeKeys = new Set();

    
    for (const entry of entries) {
      const qty = Number(entry.qty);
      if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 1000000) throw Object.assign(new Error('invalid_stock_quantity'), { status: 400 });
      let sku = String(entry.variantSku || '').trim();
      if (entry.newVariant) {
        const color = String(entry.newVariant.color || '').trim();
        const size = String(entry.newVariant.size || '').trim();
        if (!color || !size) throw Object.assign(new Error('new_variant_color_size_required'), { status: 400 });
        const exists = Object.entries(variants).some(([, v]) => String(v.color).toLowerCase() === color.toLowerCase() && String(v.size).toLowerCase() === size.toLowerCase());
        if (exists) throw Object.assign(new Error('variant_already_exists'), { status: 409 });
        sku = buildVariantSku(
  product.sku || 'SKU',
  color,
  size
);
        if (variants[sku]) throw Object.assign(new Error('variant_sku_already_exists'), { status: 409 });
        const regularPrice = Math.max(0, Number(entry.newVariant.regularPrice) || Number(product.baseRegularPrice) || 0);
        const sellingPrice = Math.max(0, Number(entry.newVariant.sellingPrice) || Number(product.baseSellingPrice) || 0);
        if (regularPrice > 0 && sellingPrice > regularPrice) throw Object.assign(new Error('variant_price_invalid'), { status: 400 });
       
        const barcode = cleanBarcode(
  entry.newVariant.barcode
) || sku;
const barcodeRef = barcodeDocRef(barcode);
const barcodeSnap = await tx.get(barcodeRef);

if (newBarcodeKeys.has(barcode.toUpperCase())) {
  throw Object.assign(
    new Error('duplicate_barcode'),
    { status: 409 }
  );
}

newBarcodeKeys.add(barcode.toUpperCase());

if (barcodeSnap.exists) {
  const owner = barcodeSnap.data() || {};

  const sameOwner =
    owner.productId === pSnap.id &&
    owner.type === 'variant' &&
    owner.variantSku === sku;

  if (!sameOwner) {
    throw Object.assign(
      new Error(`duplicate_barcode:${barcode}`),
      { status: 409 }
    );
  }
}

newBarcodeClaims.push({
  ref: barcodeRef,
  barcode,
  productId: pSnap.id,
  type: 'variant',
  variantSku: sku,
  previous: barcodeSnap.exists ? barcodeSnap.data() : null
});
        
        variants[sku] = {
  color,
  size,
  variantSku: sku,
  barcode,

  regularPrice,
  sellingPrice,

  discountPercent: regularPrice > 0
    ? Math.max(
        0,
        Math.round((regularPrice - sellingPrice) / regularPrice * 100)
      )
    : 0,

  stock: 0,
  lowStockAlert: Math.max(
    0,
    Number(entry.newVariant.lowStockAlert ?? 5)
  ),

  isActive: true
};
      }
      if (!variants[sku]) throw Object.assign(new Error(`variant_not_found:${sku}`), { status: 400 });
      if (variants[sku].isActive === false) throw Object.assign(new Error(`variant_inactive:${sku}`), { status: 400 });
      added.push({ variantSku: sku, qty });
    }

    let lot = stockLots.find(x => String(x.lotId) === lotRef.id);
    if (!lot) {
      lot = {
        lotId: lotRef.id,
        lotNo: mode === 'new' ? lotNo : String(lSnap.data()?.lotNo || lotRef.id),
        createdAt: mode === 'new' ? Date.now() : Number(lSnap.data()?.createdAt || Date.now()),
        note: String(body.note || '').trim().slice(0, 500),
        quantities: {}
      };
      stockLots.push(lot);
    }
    for (const item of added) lot.quantities[item.variantSku] = Math.max(0, Number(lot.quantities[item.variantSku]) || 0) + item.qty;

    const updated = { ...product, variants, stockLots };
    updated.variants = syncVariantTotals(updated, stockLots);
    const summary = summarize(updated);
    summary.updatedAt = Date.now();
    summary.cacheUpdatedAt = Date.now();

// Save newly created Variant Barcode claims.
for (const claim of newBarcodeClaims) {
  const now = Date.now();

  tx.set(claim.ref, {
    barcode: claim.barcode,
    productId: claim.productId,
    type: claim.type,
    variantSku: claim.variantSku,
    format: 'CODE128',
    createdAt: claim.previous?.createdAt || now,
    updatedAt: now
  });
}

    
    const version = Number(versionSnap.data()?.version || 0) + 1;
    const changes = [...(Array.isArray(versionSnap.data()?.changes) ? versionSnap.data().changes : []), { version, id: pSnap.id, deleted: false, at: Date.now() }].slice(-300);
    tx.update(productRef, {
      variants: summary.variants, stockLots, totalStock: summary.totalStock,
      availableSizes: summary.availableSizes, availableColors: summary.availableColors,
      stockStatus: summary.stockStatus, hasLowStock: summary.hasLowStock,
      lowStockCount: summary.lowStockCount, updatedAt: summary.updatedAt, cacheUpdatedAt: summary.cacheUpdatedAt
    });
    if (mode === 'new') tx.create(lotRef, {
      lotNo, createdAt: lot.createdAt, note: lot.note, status: 'active',
      createdAtServer: Date.now(), updatedAt: Date.now()
    });
    tx.set(db.doc('meta/catalog'), { items: { [pSnap.id]: buildCatalogItem(pSnap.id, summary) }, updatedAt: Date.now() }, { merge: true });
    tx.set(db.doc('meta/catalogVersion'), { version, changes, updatedAt: Date.now() }, { merge: true });
    return { lotId: lotRef.id, lotNo: lot.lotNo, added, totalStock: summary.totalStock };
  });

  res.status(200).json({ ok: true, ...result });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const s = await db.doc(`products/${req.params.id}`).get();
  if (!s.exists) return res.status(404).json({ ok: false, error: 'not_found' });
  const privateCost = await costStore.readCost(req.params.id);
  res.json({ ok: true, item: { id: s.id, ...s.data() }, privateCost });
}));

router.post('/', asyncHandler(async (req, res) => save(req, res, true)));
router.put('/:id', asyncHandler(async (req, res) => save(req, res, false)));

// Draft ছাড়াই ছবি আপলোড করার জন্য এখানে কোনো productSnap.exists চেক করা হয়নি
router.post('/cloudinary-signature', asyncHandler(async (req, res) => {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloudName || !apiKey || !secret) return res.status(503).json({ ok: false, error: 'cloudinary_not_configured' });
  
  const productId = String(req.body?.productId || '').trim();
  if (!productId || !/^[A-Za-z0-9_-]{5,100}$/.test(productId)) return res.status(400).json({ ok: false, error: 'invalid_product_id' });
  
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `nishat/products/${productId}`;
  const toSign = `folder=${folder}&timestamp=${timestamp}${secret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');
  res.json({ ok: true, cloudName, apiKey, timestamp, folder, signature });
}));

router.post('/cloudinary-delete', asyncHandler(async (req, res) => {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret } = process.env;
  const publicId = String(req.body?.publicId || '');
  if (!cloudName || !apiKey || !secret) return res.status(503).json({ ok: false, error: 'cloudinary_not_configured' });
  if (!publicId.startsWith('nishat/products/')) return res.status(400).json({ ok: false, error: 'invalid_public_id' });
  
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${secret}`).digest('hex');
  const body = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: apiKey, signature });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.result !== 'ok') return res.status(502).json({ ok: false, error: result.error?.message || 'cloudinary_delete_failed' });
  res.json({ ok: true, result: result.result });
}));

module.exports = router;
