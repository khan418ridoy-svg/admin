
const { db } = require('../../config/firebase');

const BARCODE_RE = /^[A-Za-z0-9._-]{1,64}$/;

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

function cleanBarcode(value) {
  const s = String(value ?? '').trim();

  if (!s) return '';

  if (!BARCODE_RE.test(s)) {
    throw fail('invalid_barcode');
  }

  return s;
}

// Barcode comparison is case-insensitive.
function barcodeKey(value) {
  const barcode = cleanBarcode(value);
  return barcode ? barcode.toUpperCase() : '';
}

// Firestore document ID for a barcode.
function barcodeDocRef(value) {
  const key = barcodeKey(value);

  if (!key) {
    throw fail('barcode_required');
  }

  return db.doc(`barcodes/${key}`);
}

// Product SKU + Color + Size = Variant SKU.
function buildVariantSku(productSku, color, size) {
  const sku = (
    `${String(productSku || 'SKU')}-${String(color || '')}-${String(size || '')}`
  )
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

  if (!/^[A-Z0-9_-]{1,64}$/.test(sku)) {
    throw fail('variant_sku_generation_failed');
  }

  return sku;
}

// Check Product Barcode + all Variant Barcodes together.
function assertUniqueVariantBarcodes(variants, productBarcode = '') {
  const seen = new Set();

  if (productBarcode) {
    seen.add(barcodeKey(productBarcode));
  }

  for (const [sku, variant] of Object.entries(variants || {})) {
    const barcode = cleanBarcode(variant.barcode || sku);
    const key = barcodeKey(barcode);

    if (seen.has(key)) {
      throw fail(`duplicate_barcode:${barcode}`, 409);
    }

    seen.add(key);
  }
}

/**
 * Transaction-safe global barcode registry.
 *
 * Firestore:
 * barcodes/{BARCODE}
 *
 * {
 *   barcode: "8901234567890",
 *   productId: "product123",
 *   type: "variant",
 *   variantSku: "NF-RM-0012-BLACK-XL",
 *   createdAt: 123456789,
 *   updatedAt: 123456789
 * }
 *
 * All reads happen before writes.
 */
async function syncBarcodeRegistry(tx, productId, entries) {
  if (!productId) {
    throw fail('barcode_product_id_required');
  }

  const desired = new Map();

  for (const entry of entries || []) {
    const barcode = cleanBarcode(entry.barcode);

    if (!barcode) {
      throw fail('barcode_required');
    }

    if (!['product', 'variant'].includes(entry.type)) {
      throw fail('invalid_barcode_type');
    }

    const key = barcodeKey(barcode);

    if (desired.has(key)) {
      throw fail(`duplicate_barcode:${barcode}`, 409);
    }

    desired.set(key, {
      barcode,
      productId,
      type: entry.type,
      variantSku: entry.type === 'variant'
        ? String(entry.variantSku || '')
        : null
    });
  }

  const registryQuery = db.collection('barcodes')
    .where('productId', '==', productId);

  const desiredRefs = [...desired.keys()].map(key =>
    db.doc(`barcodes/${key}`)
  );

  // Read existing claims and all requested barcode documents.
  const [existingSnap, desiredSnaps] = await Promise.all([
    tx.get(registryQuery),
    Promise.all(desiredRefs.map(ref => tx.get(ref)))
  ]);

  const now = Date.now();

  // Check global ownership before writing anything.
  for (let i = 0; i < desiredRefs.length; i++) {
    const snap = desiredSnaps[i];

    if (!snap.exists) continue;

    const wanted = [...desired.values()][i];
    const current = snap.data() || {};

    const sameOwner =
      current.productId === productId &&
      current.type === wanted.type &&
      String(current.variantSku || '') === String(wanted.variantSku || '');

    if (!sameOwner) {
      throw fail(`duplicate_barcode:${wanted.barcode}`, 409);
    }
  }

  const desiredKeys = new Set(desired.keys());

  // Delete claims no longer used by this product.
  for (const snap of existingSnap.docs) {
    if (!desiredKeys.has(snap.id)) {
      tx.delete(snap.ref);
    }
  }

  // Create/update all desired claims.
  for (let i = 0; i < desiredRefs.length; i++) {
    const ref = desiredRefs[i];
    const snap = desiredSnaps[i];
    const entry = [...desired.values()][i];

    const previous = snap.exists ? snap.data() : {};

    tx.set(ref, {
      ...entry,
      format: 'CODE128',
      createdAt: previous.createdAt || now,
      updatedAt: now
    });
  }
}

module.exports = {
  cleanBarcode,
  barcodeKey,
  barcodeDocRef,
  buildVariantSku,
  assertUniqueVariantBarcodes,
  syncBarcodeRegistry
};
