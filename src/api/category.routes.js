const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const { db } = require('../config/firebase');

router.use(adminAuth);

function normalizeTree(collections) {
  if (!Array.isArray(collections)) throw new Error('collections_must_be_array');
  const ids = new Set();
  return collections.map(c => {
    const collection = { ...c, id: String(c.id || '').trim(), name: String(c.name || '').trim(), active: c.active !== false };
    if (!collection.id || !collection.name || ids.has(collection.id)) throw new Error('invalid_or_duplicate_collection');
    ids.add(collection.id);
    const categoryIds = new Set();
    collection.categories = (Array.isArray(c.categories) ? c.categories : []).map(cat => {
      const category = { ...cat, id: String(cat.id || '').trim(), name: String(cat.name || '').trim(), active: cat.active !== false };
      if (!category.id || !category.name || categoryIds.has(category.id)) throw new Error('invalid_or_duplicate_category');
      categoryIds.add(category.id);
      const subIds = new Set();
      category.subCategories = (Array.isArray(cat.subCategories) ? cat.subCategories : Array.isArray(cat.subcategories) ? cat.subcategories : []).map(sub => {
        const item = { ...sub, id: String(sub.id || '').trim(), name: String(sub.name || '').trim(), active: sub.active !== false };
        if (!item.id || !item.name || subIds.has(item.id)) throw new Error('invalid_or_duplicate_subcategory');
        subIds.add(item.id);
        delete item.subcategories;
        return item;
      });
      delete category.subcategories;
      return category;
    });
    return collection;
  });
}

router.get('/', asyncHandler(async (req, res) => {
  const snap = await db.doc('meta/taxonomy').get();
  res.json({ ok: true, ...(snap.data() || { collections: [] }) });
}));

router.put('/', asyncHandler(async (req, res) => {
  let collections;
  try { collections = normalizeTree(req.body?.collections); }
  catch (error) { return res.status(400).json({ ok: false, error: error.message }); }
  const ref = db.doc('meta/taxonomy');
  const old = await ref.get();
  const version = Number(old.data()?.version || 0) + 1;
  await ref.set({ collections, updatedAt: Date.now(), version }, { merge: true });
  res.json({ ok: true, version });
}));

router.post('/delete-check', asyncHandler(async (req, res) => {
  const { level, collectionId, categoryId, subCategoryId } = req.body || {};
  if (!['collection', 'category', 'subcategory'].includes(level)) return res.status(400).json({ ok: false, error: 'invalid_level' });
  const snap = await db.collection('products').get();
  for (const doc of snap.docs) {
    const p = doc.data() || {};
    const paths = Array.isArray(p.categoryPaths) ? p.categoryPaths : [];
    const match = paths.some(path =>
      (level === 'collection' && path.collectionId === collectionId) ||
      (level === 'category' && path.collectionId === collectionId && path.categoryId === categoryId) ||
      (level === 'subcategory' && path.collectionId === collectionId && path.categoryId === categoryId && path.subCategoryId === subCategoryId)
    );
    const legacyMatch = level === 'collection' ? (p.collectionIds || []).includes(collectionId)
      : level === 'category' ? (p.categoryIds || []).includes(categoryId)
      : (p.subCategoryIds || []).includes(subCategoryId);
    if (match || legacyMatch) return res.status(409).json({ ok: false, error: `cannot_delete_in_use_by_product:${doc.id}` });
  }
  res.json({ ok: true, safeToDelete: true });
}));

module.exports = router;