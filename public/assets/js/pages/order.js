import { head, money, esc, ORDER_STATUS_LABELS, ORDER_ALLOWED_NEXT, FAILURE_REASONS } from '../helpers.js';
import { openOrderDetails } from './order-details.js';

export function orderTable(items) {
  return `<div class="table-wrap"><table><thead><tr>
    <th>Order</th><th>Customer</th><th>Channel</th><th>Total</th><th>Status</th><th>Verification</th><th>Update status</th>
  </tr></thead><tbody>${items.map(o => {
    const current = String(o.status || 'pending');
    const options = [current, ...(ORDER_ALLOWED_NEXT[current] || [])].map(v =>
      `<option value="${v}" ${v === current ? 'selected' : ''}>${ORDER_STATUS_LABELS[v] || v}${v === current ? ' (Current)' : ''}</option>`
    ).join('');
    const reasonOptions = FAILURE_REASONS.map(([v, l]) =>
      `<option value="${v}" ${o.failureReason === v ? 'selected' : ''}>${l}</option>`
    ).join('');
    return `<tr data-order-row="${esc(o.id)}">
      <td><button type="button" class="order-details-link" data-order-details="${esc(o.id)}">${esc(o.orderNo || o.id)}</button>
        <div class="muted">${new Date(o.createdAt || Date.now()).toLocaleString()}</div></td>
      <td>${esc(o.customer?.name || '—')}<div class="muted">${esc(o.customer?.phone || '')}</div></td>
      <td>${esc(o.source || '—')}</td>
      <td>${money(o.total)}</td>
      <td><span class="badge ${current === 'pending' ? 'amber' : current === 'failed_delivery' ? 'red' : current === 'delivered' ? 'green' : 'blue'}">${esc(ORDER_STATUS_LABELS[current] || current)}</span></td>
      <td>${esc(o.verification?.verdict || '—')}</td>
      <td><div class="order-status-controls" data-current-status="${esc(current)}">
        <select data-order-status>${options}</select>
        <small class="muted">Only valid next steps are available.</small>
        <div data-failure-fields style="display:${current === 'failed_delivery' ? 'block' : 'none'}">
          <select data-failure-reason><option value="">Select failure reason</option>${reasonOptions}</select>
        </div>
        <div data-return-fields style="display:none">
          <select data-return-reason>
            <option value="">Select return reason (required)</option>
            <option value="customer_returned">Customer returned</option>
            <option value="wrong_item">Wrong item</option>
            <option value="damaged_item">Damaged item</option>
            <option value="size_issue">Size issue</option>
            <option value="other">Other</option>
          </select>
          <label class="small"><input type="checkbox" data-return-received> Parcel physically received at store</label>
        </div>
        <textarea data-status-note rows="2" maxlength="1000" placeholder="Admin note (optional)"></textarea>
        <button class="btn small" data-save-order-status disabled>Save</button>
      </div></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No orders yet</td></tr>'}</tbody></table></div>`;
}

export async function bindOrderStatusControls(root, api, toast) {
  root.querySelectorAll('[data-order-row]').forEach(row => {
    const status = row.querySelector('[data-order-status]');
    const fields = row.querySelector('[data-failure-fields]');
    const returnFields = row.querySelector('[data-return-fields]');
    const save = row.querySelector('[data-save-order-status]');
    const current = row.querySelector('.order-status-controls').dataset.currentStatus;

    const updateControls = () => {
      fields.style.display = status.value === 'failed_delivery' ? 'block' : 'none';
      returnFields.style.display = status.value === 'returned' ? 'block' : 'none';
      save.disabled = status.value === current;
    };
    status.addEventListener('change', updateControls);
    updateControls();

    save.addEventListener('click', async () => {
      const body = { status: status.value, note: row.querySelector('[data-status-note]').value.trim() };
      if (status.value === 'failed_delivery') {
        body.failureReason = row.querySelector('[data-failure-reason]').value;
        if (!body.failureReason) return toast('Select a failure reason');
      }
      if (status.value === 'returned') {
        body.returnReason = row.querySelector('[data-return-reason]').value;
        body.returnReceived = row.querySelector('[data-return-received]').checked;
        if (!body.returnReason) return toast('Return Reason বাধ্যতামূলক');
        if (!body.returnReceived) return toast('Parcel physically received নিশ্চিত করুন');
      }
      save.disabled = true;
      try {
        const result = await api(`/api/orders/${encodeURIComponent(row.dataset.orderRow)}/status`, {
          method: 'PATCH', body: JSON.stringify(body)
        });
        toast(result.stockReleasePending
          ? 'Status saved. Stock will be restored when parcel is received.'
          : `Order status updated: ${result.status}`);
        const fresh = await api('/api/orders?limit=80');
        const table = root.querySelector('#ordersTable');
        if (table) {
          const source = root.querySelector('#source')?.value || '';
          table.innerHTML = orderTable((fresh.items || []).filter(o => !source || o.source === source));
          bindOrderStatusControls(root, api, toast);
        }
      } catch (e) {
        toast(`Status update failed: ${e.message}`);
      } finally {
        save.disabled = false;
      }
    });
  });
}

export async function renderOrders(root, { api, toast }) {
  const d = await api('/api/orders?limit=80');
  root.innerHTML = head('Orders', 'Facebook orders এবং অন্যান্য sales channel')
    + `<div class="card">
        <div class="toolbar">
          <select id="source">
            <option value="">All channels</option>
            <option value="facebook">Facebook</option>
            <option value="web">Web</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="pos">POS</option>
          </select>
        </div>
        <div id="ordersTable">${orderTable(d.items || [])}</div>
      </div>`;

  const renderOrdersList = () => {
    const source = root.querySelector('#source').value;
    const table = root.querySelector('#ordersTable');
    table.innerHTML = orderTable((d.items || []).filter(o => !source || o.source === source));
    bindOrderStatusControls(root, api, toast);
  };
  root.querySelector('#source').onchange = renderOrdersList;
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-order-details]');
    if (b) openOrderDetails(root, api, b.dataset.orderDetails, toast);
  });
  bindOrderStatusControls(root, api, toast);
}