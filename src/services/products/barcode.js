
const { db } = require('../../config/firebase');

const BARCODE_RE = /^[A-Za-z0-9._-]{1,64}$/;
const COUNTER_PATH = 'meta/barcodeSequence';

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

// Code 128-compatible barcode: NF + 12 digit sequence.
function formatBarcode(number) {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw fail('invalid_barcode_sequence');
  }

  return `NF${String(number).padStart(12, '0')}`;
}

/**
 * Transaction-safe unique barcode allocation.
 * Generated barcode registry: barcodes/{barcode}
 */
async function allocateBarcode(productId, variantSku) {
  const counterRef = db.doc(COUNTER_PATH);

  return db.runTransaction(async tx => {
    const counterSnap = await tx.get(counterRef);
    let number = Math.max(
      0,
      Number(counterSnap.data()?.lastNumber) || 0
    );

    let barcode;
    let barcodeRef;
    let barcodeSnap;

    do {
      number += 1;
      barcode = formatBarcode(number);
      barcodeRef = db.doc(`barcodes/${barcode}`);
      barcodeSnap = await tx.get(barcodeRef);
    } while (barcodeSnap.exists);

    const now = Date.now();

    tx.set(counterRef, {
      lastNumber: number,
      updatedAt: now
    }, { merge: true });

    tx.create(barcodeRef, {
      productId,
      variantSku,
      type: 'variant',
      format: 'CODE128',
      createdAt: now
    });

    return barcode;
  });
}

function assertUniqueVariantBarcodes(variants) {
  const seen = new Set();

  for (const v of Object.values(variants || {})) {
    if (!v.barcode) continue;

    if (seen.has(v.barcode)) {
      throw fail(`duplicate_variant_barcode:${v.barcode}`, 409);
    }

    seen.add(v.barcode);
  }
}

module.exports = {
  cleanBarcode,
  assertUniqueVariantBarcodes,
  allocateBarcode,
  formatBarcode
};
