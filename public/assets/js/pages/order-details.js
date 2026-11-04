import { money, esc, ORDER_STATUS_LABELS } from '../helpers.js';

function orderDetailsHtml(o) {
  const rows = (Array.isArray(o.items) ? o.items : []).map((it, i) =>
    `<tr><td>${esc(it.name || it.productName || it.title || it.productId || `Item ${i + 1}`)}
      <div class="muted">${esc([it.color, it.size, it.variantSku].filter(Boolean).join(' / '))}</div></td>
      <td>${Number(it.qty || it.quantity || 0)}</td>
      <td>${money(it.unitPrice || it.price)}</td>
      <td>${money((Number(it.unitPrice || it.price || 0)) * (Number(it.qty || it.quantity || 0)) || it.lineTotal)}</td>
    </tr>`
  ).join('');

  const history = (Array.isArray(o.statusHistory) ? o.statusHistory : []).slice().reverse().map(h =>
    `<li><strong>${esc(ORDER_STATUS_LABELS[h.status] || h.status || 'Update')}</strong>
      <span class="muted">${h.changedAt ? new Date(h.changedAt).toLocaleString() : '—'}</span>
      ${h.note ? `<p>${esc(h.note)}</p>` : ''}
      ${h.failureReason ? `<p>Failure: ${esc(h.failureReason)}</p>` : ''}
      ${h.returnReason ? `<p>Return: ${esc(h.returnReason)}</p>` : ''}
    </li>`
  ).join('');

  const c = o.customer || {};

  return `<div class="order-details-overlay" data-close-order-details>
    <section class="order-details-modal" role="dialog" aria-modal="true" aria-label="Order details">
      <div class="order-details-head">
        <div>
          <h2>Order ${esc(o.orderNo || o.id)}</h2>
          <p class="muted">${o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'} · ${esc(o.source || '—')}</p>
        </div>
        <button type="button" class="btn outline" data-close-order-details>✕ Close</button>
      </div>
      <div class="order-details-grid">
        <section><h3>Customer</h3>
          <p><strong>${esc(c.name || '—')}</strong></p>
          <p>${esc(c.phone || '—')}</p>
          <p>${esc(c.address || '—')}</p>
          <p>${esc(c.district || '')}</p>
        </section>
        <section><h3>Order summary</h3>
          <p>Status: <strong>${esc(ORDER_STATUS_LABELS[o.status] || o.status || 'Pending')}</strong></p>
          <p>Verification: ${esc(o.verification?.verdict || '—')}</p>
          <p>Payment: ${esc(o.paymentMethod || o.payment?.method || '—')}</p>
        </section>
      </div>
      <h3>Products</h3>
      <div class="table-wrap"><table><thead><tr>
        <th>Product / Variant</th><th>Qty</th><th>Unit price</th><th>Line total</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="4">No item details available</td></tr>'}</tbody></table></div>
      <div class="order-details-totals">
        <p>Subtotal <strong>${money(o.subtotal)}</strong></p>
        <p>Delivery <strong>${money(o.deliveryCharge)}</strong></p>
        <p>Discount <strong>${money(o.discount)}</strong></p>
        <p class="total">Total <strong>${money(o.total)}</strong></p>
      </div>
      ${o.failureReason ? `<p>Failure reason: ${esc(o.failureReason)}</p>` : ''}
      ${o.returnReason ? `<p>Return reason: ${esc(o.returnReason)}</p>` : ''}
      <h3>Status history</h3>
      <ol class="order-history">${history || '<li>No status history recorded</li>'}</ol>
    </section>
  </div>`;
}

export async function openOrderDetails(root, api, id, toast) {
  try {
    const d = await api(`/api/orders/${encodeURIComponent(id)}`);
    const old = root.querySelector('.order-details-overlay');
    old?.remove();
    root.insertAdjacentHTML('beforeend', orderDetailsHtml(d.item || {}));
    const overlay = root.querySelector('.order-details-overlay');
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('[data-close-order-details]')) overlay.remove();
    });
  } catch (e) {
    toast(`Order details load failed: ${e.message}`);
  }
}