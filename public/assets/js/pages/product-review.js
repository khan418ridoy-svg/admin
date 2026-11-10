import { esc } from '../helpers.js';

// Review mark: pending (unchecked) | ok | not_ok
export const REVIEW = {
  ok: { label: '✔ OK', cls: 'review-ok' },
  not_ok: { label: '✖ Not OK', cls: 'review-bad' },
  pending: { label: '● Unchecked', cls: 'review-pending' }
};

export const reviewOf = p => (REVIEW[p?.review?.status] ? p.review.status : 'pending');

export function reviewBadge(p) {
  const r = REVIEW[reviewOf(p)];
  return `<span class="review-badge ${r.cls}" data-review-badge="${esc(String(p.id))}">${r.label}</span>`;
}

export function applyReviewBadge(el, p) {
  const r = REVIEW[reviewOf(p)];
  el.className = `review-badge ${r.cls}`;
  el.textContent = r.label;
}

// Saves the mark on the server, then updates the local product object.
export async function markReview(api, product, status) {
  const res = await api(`/api/products/${encodeURIComponent(product.id)}/review`, {
    method: 'PATCH', body: JSON.stringify({ status })
  });
  product.review = res.review || { status, at: Date.now() };
  return product.review;
}

const ERRORS = {
  review_not_ok: 'আগে Product View করে "OK" mark দিন, তারপর Active করুন',
  active_product_requires_minimum_3_images: 'Active করতে কমপক্ষে ৩টি image লাগবে',
  duplicate_barcode: 'এই Barcode অন্য একটি Product-এ আছে',
  duplicate_variant_barcode: 'একই Barcode একাধিক Variant-এ দেওয়া যাবে না',
  invalid_barcode: 'Barcode-এ শুধু ইংরেজি অক্ষর, সংখ্যা, - _ . ব্যবহার করুন (সর্বোচ্চ ৬৪)',
  duplicate_sku: 'এই SKU আগে থেকেই আছে',
  product_not_found: 'Product পাওয়া যায়নি'
};

export function friendlyError(e) {
  const msg = String(e?.message || e || '');
  const key = Object.keys(ERRORS).find(k => msg === k || msg.startsWith(`${k}:`));
  return key ? ERRORS[key] : msg;
}

export const skipReasonText = reason => ERRORS[reason] || reason;
