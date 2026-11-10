const BARCODE_RE = /^[A-Za-z0-9._-]{1,64}$/;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// '' means "no barcode". Anything else must look like a real barcode.
function cleanBarcode(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (!BARCODE_RE.test(s)) throw fail('invalid_barcode');
  return s;
}

// Two variants of the same product must not share a barcode.
function assertUniqueVariantBarcodes(variants) {
  const seen = new Set();
  for (const v of Object.values(variants || {})) {
    if (!v.barcode) continue;
    if (seen.has(v.barcode)) throw fail(`duplicate_variant_barcode:${v.barcode}`, 409);
    seen.add(v.barcode);
  }
}

module.exports = { cleanBarcode, assertUniqueVariantBarcodes };
