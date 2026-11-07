const router = require('express').Router();
const crypto = require('crypto');
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const { db, FieldValue } = require('../config/firebase');
const { buildCatalogItem } = require('../services/catalog/toItem');
const productCache = require('../services/catalog/productCache');

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

function normalizeVariants(input, old = {}, isCreate = false, baseRegularPrice = 0, baseSellingPrice = 0) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('variants_must_be_map'), { status: 400 });
  const out = {};
  for (const [sku, v0] of Object.entries(input)) {
    const v = { ...v0 };
    if (!v.color || !v.size) throw Object.assign(new Error(`variant_color_size_required:${sku}`), { status: 400 });
    const prior = old[sku], stock = prior ? Number(prior.stock || 0) : Math.max(0, Number(v.stock) || 0);
    out[sku] = {
      color: String(v.color), size: String(v.size), variantSku: sku,
      regularPrice: Math.max(0, Number(v.regularPrice) > 0 ? Number(v.regularPrice) : Number(baseRegularPrice) || 0),
      sellingPrice: Math.max(0, Number(v.sellingPrice) > 0 ? Number(v.sellingPrice) : Number(baseSellingPrice) || 0),
      discountPercent: (Number(v.regularPrice) > 0 ? Number(v.regularPrice) : Number(baseRegularPrice) || 0) > 0 ? Math.max(0, Math.round((((Number(v.regularPrice) > 0 ? Number(v.regularPrice) : Number(baseRegularPrice) || 0) - (Number(v.sellingPrice) > 0 ? Number(v.sellingPrice) : Number(baseSellingPrice) || 0)) / (Number(v.regularPrice) > 0 ? Number(v.regularPrice) : Number(baseRegularPrice) || 0)) * 100)) : 0,
      stock,
      lowStockAlert: Math.max(0, Number(v.lowStockAlert ?? 5)),
      isActive: v.isActive !== false,
      ...(v.barcode ? { barcode: String(v.barcode) } : {})
    };
  }
  for (const [sku, v] of Object.entries(old || {})) {
    if (!out[sku]) out[sku] = { ...v, stock: Number(v.stock || 0) };
  }
  return out;
}

async function save(req, res, isCreate) {
  const data = req.body || {};
  if (!String(data.name || '').trim() || !String(data.sku || '').trim()) return res.status(400).json({ ok: false, error: 'name_and_sku_required' });
  const id = isCreate ? db.collection('products').doc().id : req.params.id;
  const ref = db.doc(`products/${id}`), oldSnap = await ref.get();
  if (!isCreate && !oldSnap.exists) return res.status(404).json({ ok: false, error: 'not_found' });
  const old = oldSnap.data() || {};
  
  const sku = String(data.sku).trim().toUpperCase(), dup = await db.collection('products').where('sku', '==', sku).limit(2).get();
  if (dup.docs.some(d => d.id !== id)) return res.status(409).json({ ok: false, error: 'duplicate_sku' });
  
  let paths;
  try { paths = await mapTaxonomy(Array.isArray(data.categoryPaths) ? data.categoryPaths : []); }
  catch (e) { return res.status(e.status || 400).json({ ok: false, error: e.message }); }
  if (!paths.length) return res.status(400).json({ ok: false, error: 'at_least_one_category_required' });
  
  const baseRegularPrice = Math.max(0, Number(data.baseRegularPrice) || 0), baseSellingPrice = Math.max(0, Number(data.baseSellingPrice) || 0);
  if (baseRegularPrice > 0 && baseSellingPrice > baseRegularPrice) return res.status(400).json({ ok: false, error: 'default_selling_price_cannot_exceed_regular_price' });
  
  const variants = normalizeVariants(data.variants, old.variants || {}, isCreate, baseRegularPrice, baseSellingPrice);
  if (!Object.keys(variants).length) return res.status(400).json({ ok: false, error: 'at_least_one_variant_required' });
  
  const images = Array.isArray(data.images) ? data.images.filter(x => x && x.url).slice(0, 12) : [];
  if (data.status === 'active' && images.length < 3) return res.status(400).json({ ok: false, error: 'active_product_requires_minimum_3_images' });
  
  const slug = old.slug || await uniqueSlug(slugify(data.name), id);
  const now = Date.now(), first = paths[0];
  let shortCode = old.shortCode || String(data.shortCode || '').trim().toUpperCase();
  
  if (!shortCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 8; attempt++) {
      let candidate = '';
      for (let i = 0; i < 5; i++) candidate += chars[crypto.randomInt(chars.length)];
      const exists = await db.doc(`shortCodes/${candidate}`).get();
      if (!exists.exists) { shortCode = candidate; break; }
    }
    if (!shortCode) throw Object.assign(new Error('short_code_generation_failed'), { status: 503 });
  }
  
  const codeRef = await db.doc(`shortCodes/${shortCode}`).get();
  if (codeRef.exists && codeRef.data()?.productId !== id) return res.status(409).json({ ok: false, error: 'duplicate_short_code' });
  
  const final = {
    ...old, ...data, id: undefined, slug, sku, shortCode,
    brand: String(data.brand || 'Nishat Fashion'),
    status: ['active', 'inactive', 'draft'].includes(data.status) ? data.status : 'draft',
    lotId: data.lotId || null,
    baseRegularPrice, baseSellingPrice, categoryPaths: paths,
    collectionId: first.collectionId, collectionSlug: first.collectionId, categoryId: first.categoryId, subCategoryId: first.subCategoryId || null,
    collectionName: first.collectionName, categoryName: first.categoryName, subCategoryName: first.subCategoryName,
    tags: Array.isArray(data.tags) ? data.tags.map(String).slice(0, 30) : [],
    images, mainImage: data.mainImage || images[0]?.url || '', hoverImage: data.hoverImage || images[1]?.url || '',
    variants, createdAt: old.createdAt || now, updatedAt: now, createdBy: old.createdBy || req.user.uid,
    ratingAvg: Number(old.ratingAvg || 0), ratingCount: Number(old.ratingCount || 0),
    ratingBreakdown: old.ratingBreakdown || { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 },
    latestReviews: old.latestReviews || [], soldCount: Number(old.soldCount || 0)
  };
  
  delete final.id; delete final.buyPrice; delete final.variantBuyPrice; delete final.supplier; delete final.purchaseNote; delete final.profitPerPiece; delete final.aiNotes;
  
  if (!final.metaTitle) final.metaTitle = String(final.name || '').slice(0, 60);
  if (!final.metaDescription) final.metaDescription = String(final.shortDescription || '').slice(0, 160);
  
  const result = summarize(final);
  result.cacheUpdatedAt = now;
  
  const batch = db.batch();
  batch.set(ref, result);
  
  const cost = { updatedAt: now };
  if (data.buyPrice !== undefined) cost.buyPrice = Math.max(0, Number(data.buyPrice) || 0);
  if (data.variantBuyPrice && typeof data.variantBuyPrice === 'object') cost.variantBuyPrice = data.variantBuyPrice;
  if (data.supplier !== undefined) cost.supplier = String(data.supplier);
  if (data.purchaseNote !== undefined) cost.purchaseNote = String(data.purchaseNote);
  if (Object.keys(cost).length > 1) batch.set(db.doc(`productCosts/${id}`), cost, { merge: true });
  
  batch.set(db.doc('meta/catalog'), { items: { [id]: buildCatalogItem(id, result) }, updatedAt: now }, { merge: true });
  batch.set(db.doc(`shortCodes/${shortCode}`), { productId: id, sku, updatedAt: now }, { merge: true });
  
  await batch.commit();

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

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['active', 'inactive', 'draft'].includes(status)) return res.status(400).json({ ok: false, error: 'invalid_status' });
  const ref = db.doc(`products/${req.params.id}`), snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ ok: false, error: 'product_not_found' });
  const updatedAt = Date.now(), next = { ...snap.data(), status, updatedAt }, batch = db.batch();
  batch.update(ref, { status, updatedAt });
  batch.set(db.doc('meta/catalog'), { items: { [req.params.id]: buildCatalogItem(req.params.id, next) }, updatedAt }, { merge: true });
  await batch.commit();
  await productCache.recordChange(req.params.id, false);
  res.json({ ok: true, id: req.params.id, status });
}));

router.patch('/bulk-status', asyncHandler(async (req, res) => {
  const { ids, status } = req.body;
  if (!['active', 'inactive', 'draft'].includes(status)) return res.status(400).json({ ok: false, error: 'invalid_status' });
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ ok: false, error: 'no_ids_provided' });

  const batch = db.batch();
  const updatedAt = Date.now();

  for (const id of ids) {
    const ref = db.doc(`products/${id}`);
    batch.update(ref, { status, updatedAt });
    
    // ক্যাশে আপডেট (শুধু active/inactive হলে)
    if (status !== 'draft') {
      const snap = await ref.get();
      if (snap.exists) {
        batch.set(db.doc('meta/catalog'), { items: { [id]: buildCatalogItem(id, { ...snap.data(), status, updatedAt }) }, updatedAt }, { merge: true });
      }
    }
  }
  await batch.commit();

  if (status !== 'draft') {
    for (const id of ids) {
      await productCache.recordChange(id, false);
    }
  }

  res.json({ ok: true, count: ids.length, status });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const s = await db.doc(`products/${req.params.id}`).get();
  if (!s.exists) return res.status(404).json({ ok: false, error: 'not_found' });
  const cost = await db.doc(`productCosts/${req.params.id}`).get();
  res.json({ ok: true, item: { id: s.id, ...s.data() }, privateCost: cost.data() || {} });
}));

router.post('/', asyncHandler(async (req, res) => save(req, res, true)));
router.put('/:id', asyncHandler(async (req, res) => save(req, res, false)));

// Draft ছাড়াই ছবি আপলোড করার জন্য এখানে কোনো productSnap.exists চেক করা হয়নি
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