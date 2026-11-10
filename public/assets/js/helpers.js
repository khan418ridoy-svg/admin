
// Shared utility functions used across pages

export const money = n => '৳' + Number(n || 0).toLocaleString('en-BD');

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

export const head = (title, sub, action = '') =>
  `<div class="page-head"><div><h1>${title}</h1><p class="sub">${sub}</p></div>${action}</div>`;

export const btn = (label, cls = '') =>
  `<button class="btn ${cls}">${label}</button>`;

export function slugId(value) {
  return String(value || '').trim().toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function inboxText(value) {
  if (value == null) return '';

  if (typeof value === 'string') return value;

  if (typeof value === 'object') {
    return String(
      value.text ||
      value.message ||
      value.body ||
      value.content ||
      JSON.stringify(value)
    );
  }

  return String(value);
}

// Order Status Labels
export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  completed: 'Complete',
  failed_delivery: 'Failed Delivery',
  cancelled: 'Cancelled',
  returned: 'Returned'
};

// Allowed Next Order Status
export const ORDER_ALLOWED_NEXT = {
  pending: [
    'confirmed',
    'processing',
    'packed',
    'shipped',
    'out_for_delivery',
    'cancelled'
  ],

  confirmed: [
    'processing',
    'packed',
    'shipped',
    'out_for_delivery',
    'cancelled'
  ],

  processing: [
    'packed',
    'shipped',
    'out_for_delivery',
    'cancelled'
  ],

  packed: [
    'shipped',
    'out_for_delivery',
    'cancelled'
  ],

  shipped: [
    'out_for_delivery'
  ],

  out_for_delivery: [
    'delivered',
    'failed_delivery',
    'returned'
  ],

  delivered: [
    'returned'
  ],

  failed_delivery: [
    'out_for_delivery',
    'returned'
  ],

  completed: [],
  cancelled: [],
  returned: []
};

// Failed Delivery Reasons
export const FAILURE_REASONS = [
  ['phone_unreachable', 'Phone Unreachable'],
  ['customer_unavailable', 'Customer Unavailable'],
  ['customer_refused', 'Customer Refused'],
  ['wrong_address', 'Wrong Address'],
  ['courier_issue', 'Courier Issue'],
  ['other', 'Other']
];
