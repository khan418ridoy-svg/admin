// All private purchase costs live in ONE document: meta/productCosts
//   { items: { [productId]: { buyPrice, variantBuyPrice, supplier, purchaseNote, updatedAt } }, updatedAt }
// Reading costs for 500 products = 1 Firestore read (same idea as meta/catalog).
// Firestore documents are limited to 1 MB: roughly 2000+ products. Past that, split by shard.
// Never allow client (browser) access to this document in Firestore rules — admin API only.
const { db } = require('../../config/firebase');

const DOC_PATH = 'meta/productCosts';
const LEGACY_COLLECTION = 'productCosts';
const MAX_DOC_BYTES = 900 * 1024;

const costDoc = () => db.doc(DOC_PATH);

// Picks only the cost fields that the request actually sent.
function pickCostFields(data) {
  const cost = {};
  if (data.buyPrice !== undefined) cost.buyPrice = Math.max(0, Number(data.buyPrice) || 0);
  if (data.variantBuyPrice && typeof data.variantBuyPrice === 'object' && !Array.isArray(data.variantBuyPrice)) {
    cost.variantBuyPrice = data.variantBuyPrice;
  }
  if (data.supplier !== undefined) cost.supplier = String(data.supplier);
  if (data.purchaseNote !== undefined) cost.purchaseNote = String(data.purchaseNote);
  return cost;
}

// Adds the cost write to a batch. Only the sent fields are replaced (others stay).
// Returns false when the request carried no cost fields.
function addCostToBatch(batch, productId, data, now) {
  const cost = pickCostFields(data);
  const keys = Object.keys(cost);
  if (!keys.length) return false;
  cost.updatedAt = now;
  batch.set(
    costDoc(),
    { items: { [productId]: cost }, updatedAt: now },
     function addCostToBatch(batch, productId, data, now) {   if (!productId || typeof productId !== 'string') {     throw Object.assign(new Error('invalid_product_id_for_cost'), { status: 400 });   }    const cost = pickCostFields(data);   if (!Object.keys(cost).length) return false;    cost.updatedAt = now;    batch.set(     costDoc(),     {       items: {         [productId]: cost       },       updatedAt: now     },     { merge: true }   );    return true; }
  );
  return true;
}

// One product's cost. Falls back to the old productCosts/{id} document until migration is done.
async function readCost(productId) {
  const snap = await costDoc().get();
  const found = snap.data()?.items?.[productId];
  if (found) return found;
  const legacy = await db.doc(`${LEGACY_COLLECTION}/${productId}`).get();
  return legacy.data() || {};
}

// Every cost in a single read.
async function readAllCosts() {
  const snap = await costDoc().get();
  const data = snap.data() || {};
  return { items: data.items || {}, updatedAt: data.updatedAt || 0 };
}

// One-time: copies old productCosts/{id} documents into meta/productCosts.
// Newer entries already in meta/productCosts win over old ones.
async function migrateLegacyCosts() {
  const [legacySnap, currentSnap] = await Promise.all([db.collection(LEGACY_COLLECTION).get(), costDoc().get()]);
  const items = {};
  legacySnap.forEach(d => { items[d.id] = d.data(); });
  Object.assign(items, currentSnap.data()?.items || {});
  const size = Buffer.byteLength(JSON.stringify(items));
  if (size > MAX_DOC_BYTES) throw Object.assign(new Error('cost_doc_too_large'), { status: 413 });
  const now = Date.now();
  await costDoc().set({ items, updatedAt: now, migratedAt: now });
  return { migrated: legacySnap.size, total: Object.keys(items).length, bytes: size };
}

module.exports = { addCostToBatch, readCost, readAllCosts, migrateLegacyCosts };
