const { db } = require('../../config/firebase');
const { buildCatalogItem } = require('./toItem');

const products = new Map();
let catalogVersion = 0;
let loaded = false;
let loading = null;
let lastVersionCheck = 0;
let taxonomyCache = null;
let taxonomyLoadedAt = 0;

const VERSION_DOC = 'meta/catalogVersion';
const VERSION_CHECK_TTL_MS = Math.max(0, Number(process.env.CATALOG_VERSION_CHECK_TTL_MS || 0));
const CHANGE_LIMIT = 300;

function normalizeProduct(id, data) {
  return { ...data, ...buildCatalogItem(id, data), id, variants: data.variants || {} };
}

async function loadAll() {
  if (loading) return loading;
  loading = (async () => {
    const [productSnap, versionSnap] = await Promise.all([db.collection('products').get(), db.doc(VERSION_DOC).get()]);
    products.clear();
    productSnap.docs.forEach(d => products.set(d.id, normalizeProduct(d.id, d.data())));
    catalogVersion = Number(versionSnap.data()?.version || 0);
    loaded = true;
    lastVersionCheck = Date.now();
    console.log(`[PRODUCT CACHE] Loaded ${products.size} products at version ${catalogVersion}`);
    return products.size;
  })();
  try { return await loading; } finally { loading = null; }
}

async function refreshIfNeeded(force = false) {
  if (!loaded) await loadAll();
  const now = Date.now();
  if (!force && VERSION_CHECK_TTL_MS > 0 && now - lastVersionCheck < VERSION_CHECK_TTL_MS) return;
  const snap = await db.doc(VERSION_DOC).get();
  lastVersionCheck = now;
  if (!snap.exists) return;
  const data = snap.data() || {};
  const latest = Number(data.version || 0);
  if (latest <= catalogVersion) return;
  const changes = Array.isArray(data.changes) ? data.changes : [];
  const earliest = Number(changes[0]?.version || latest);
  if (catalogVersion < earliest - 1 || !changes.length) { await loadAll(); return; }
  const pending = changes.filter(x => Number(x.version) > catalogVersion);
  const ids = [...new Set(pending.map(x => String(x.id || '')).filter(Boolean))];
  if (ids.length) {
    const refs = ids.map(id => db.doc(`products/${id}`));
    const docs = await db.getAll(...refs);
    const deleted = new Set(pending.filter(x => x.deleted).map(x => String(x.id)));
    docs.forEach(d => {
      if (d.exists) products.set(d.id, normalizeProduct(d.id, d.data()));
      else products.delete(d.id);
    });
    deleted.forEach(id => products.delete(id));
  }
  catalogVersion = latest;
  console.log(`[PRODUCT CACHE] Applied ${ids.length} changed products; version ${catalogVersion}`);
}

async function recordChange(id, deleted = false) {
  const ref = db.doc(VERSION_DOC);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const old = snap.data() || {};
    const version = Number(old.version || 0) + 1;
    const changes = [...(Array.isArray(old.changes) ? old.changes : []), { version, id: String(id), deleted: !!deleted, at: Date.now() }].slice(-CHANGE_LIMIT);
    tx.set(ref, { version, changes, updatedAt: Date.now() }, { merge: true });
  });
}

async function getProducts() { if (!loaded) await loadAll(); return [...products.values()]; }
async function getById(id) { if (!loaded) await loadAll(); return products.get(String(id)) || null; }
async function getTaxonomy() {
  if (!taxonomyCache || Date.now() - taxonomyLoadedAt > 60_000) {
    const snap = await db.doc('meta/taxonomy').get();
    taxonomyCache = snap.data()?.collections || [];
    taxonomyLoadedAt = Date.now();
  }
  return taxonomyCache;
}
function invalidateTaxonomy() { taxonomyLoadedAt = 0; }
module.exports = { loadAll, refreshIfNeeded, recordChange, getProducts, getById, getTaxonomy, invalidateTaxonomy, stats: () => ({ loaded, count: products.size, version: catalogVersion }) };