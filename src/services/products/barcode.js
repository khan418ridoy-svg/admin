
const { db } = require('../../config/firebase');

const BARCODE_RE = /^[A-Za-z0-9._-]{1,64}$/;

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

/**
 * Validate and normalize barcode input.
 * Empty input returns an empty string.
 */
function cleanBarcode(value) {
  const barcode = String(value ?? '').trim();

  if (!barcode) return '';

  if (!BARCODE_RE.test(barcode)) {
    throw fail('invalid_barcode');
  }

  return barcode;
}

/**
 * Case-insensitive barcode key.
 * Example: abc123 -> ABC123
 */
function barcodeKey(value) {
  const barcode = cleanBarcode(value);
  return barcode ? barcode.toUpperCase() : '';
}

/**
 * Firestore document reference.
 * barcodes/{UPPERCASE_BARCODE}
 */
function barcodeDocRef(value) {
  const key = barcodeKey(value);

  if (!key) {
    throw fail('barcode_required');
  }

  return db.doc(`barcodes/${key}`);
}

/**
 * Generate Variant SKU from Product SKU + Color + Size.
 */
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

/**
 * Check Product Barcode + all Variant Barcodes together.
 */
function assertUniqueVariantBarcodes(
  variants,
  productBarcode = ''
) {
  const seen = new Set();

  if (productBarcode) {
    const productKey = barcodeKey(productBarcode);

    if (!productKey) {
      throw fail('invalid_product_barcode');
    }

    seen.add(productKey);
  }

  for (const [sku, variant] of Object.entries(variants || {})) {
    const barcode = cleanBarcode(variant?.barcode || sku);

    if (!barcode) {
      throw fail('barcode_required');
    }

    const key = barcodeKey(barcode);

    if (seen.has(key)) {
      throw fail(`duplicate_barcode:${barcode}`, 409);
    }

    seen.add(key);
  }
}

/**
 * Synchronize Product + Variant barcode registry
 * inside an existing Firestore transaction.
 *
 * Collection:
 * barcodes/{UPPERCASE_BARCODE}
 *
 * Document:
 * {
 *   barcode: "NF-0012",
 *   productId: "product123",
 *   type: "product" | "variant",
 *   variantSku: "NF-0012-BLACK-XL" | null,
 *   format: "CODE128",
 *   createdAt: 123456789,
 *   updatedAt: 123456789
 * }
 *
 * IMPORTANT:
 * All transaction reads happen before transaction writes.
 */
async function syncBarcodeRegistry(tx, productId, entries) {
  if (!productId) {
    throw fail('barcode_product_id_required');
  }

  if (!Array.isArray(entries) || !entries.length) {
    throw fail('barcode_entries_required');
  }

  const desired = new Map();

  // Validate requested barcode claims.
  for (const entry of entries) {
    const barcode = cleanBarcode(entry?.barcode);

    if (!barcode) {
      throw fail('barcode_required');
    }

    if (!['product', 'variant'].includes(entry.type)) {
      throw fail('invalid_barcode_type');
    }

    const variantSku = entry.type === 'variant'
      ? String(entry.variantSku || '').trim()
      : '';

    if (entry.type === 'variant' && !variantSku) {
      throw fail('variant_sku_required');
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
        ? variantSku
        : null
    });
  }

  const desiredEntries = [...desired.entries()];

  const registryQuery = db.collection('barcodes')
    .where('productId', '==', productId);

  const desiredRefs = desiredEntries.map(([key]) =>
    db.doc(`barcodes/${key}`)
  );

  // READ PHASE: all reads before any writes.
  const [existingSnap, desiredSnaps] = await Promise.all([
    tx.get(registryQuery),
    Promise.all(
      desiredRefs.map(ref => tx.get(ref))
    )
  ]);

  // Check whether requested barcodes belong to another record.
  for (let i = 0; i < desiredEntries.length; i++) {
    const [, wanted] = desiredEntries[i];
    const snap = desiredSnaps[i];

    if (!snap.exists) continue;

    const current = snap.data() || {};

    const sameOwner =
      current.productId === productId &&
      current.type === wanted.type &&
      String(current.variantSku || '') ===
        String(wanted.variantSku || '');

    if (!sameOwner) {
      throw fail(`duplicate_barcode:${wanted.barcode}`, 409);
    }
  }

  const desiredKeys = new Set(desired.keys());
  const now = Date.now();

  // WRITE PHASE 1:
  // Remove obsolete claims owned by this Product only.
  for (const snap of existingSnap.docs) {
    const current = snap.data() || {};

    if (
      current.productId === productId &&
      !desiredKeys.has(snap.id)
    ) {
      tx.delete(snap.ref);
    }
  }

  // WRITE PHASE 2:
  // Create or update all desired claims.
  for (let i = 0; i < desiredEntries.length; i++) {
    const [, entry] = desiredEntries[i];
    const ref = desiredRefs[i];
    const snap = desiredSnaps[i];

    const previous = snap.exists
      ? snap.data() || {}
      : {};

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
