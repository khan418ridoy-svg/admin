
import {
  head,
  money,
  esc,
  ORDER_STATUS_LABELS,
  ORDER_ALLOWED_NEXT,
  FAILURE_REASONS
} from '../helpers.js';

import { openOrderDetails } from './order-details.js';

// Status color mapping
const STATUS_COLORS = {
  pending: 'amber',
  confirmed: 'blue',
  processing: 'purple',
  packed: 'indigo',
  shipped: 'cyan',
  out_for_delivery: 'orange',
  delivered: 'green',
  completed: 'teal',
  failed_delivery: 'red',
  cancelled: 'gray',
  returned: 'pink',
  unknown: 'gray'
};

// Status badge CSS
const STATUS_STYLES = `
<style>
  .order-status-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px 11px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.4;
    white-space: nowrap;
    border: 1px solid transparent;
  }

  .order-status-badge.status-amber {
    background: #fff7df;
    color: #a16207;
    border-color: #f5d98b;
  }

  .order-status-badge.status-blue {
    background: #eaf2ff;
    color: #1d4ed8;
    border-color: #bfdbfe;
  }

  .order-status-badge.status-purple {
    background: #f3e8ff;
    color: #7e22ce;
    border-color: #e9d5ff;
  }

  .order-status-badge.status-indigo {
    background: #e0e7ff;
    color: #4338ca;
    border-color: #c7d2fe;
  }

  .order-status-badge.status-cyan {
    background: #cffafe;
    color: #0e7490;
    border-color: #a5f3fc;
  }

  .order-status-badge.status-orange {
    background: #ffedd5;
    color: #c2410c;
    border-color: #fed7aa;
  }

  .order-status-badge.status-green {
    background: #dcfce7;
    color: #15803d;
    border-color: #bbf7d0;
  }

  .order-status-badge.status-teal {
    background: #ccfbf1;
    color: #0f766e;
    border-color: #99f6e4;
  }

  .order-status-badge.status-red {
    background: #fee2e2;
    color: #b91c1c;
    border-color: #fecaca;
  }

  .order-status-badge.status-gray {
    background: #f1f5f9;
    color: #475569;
    border-color: #cbd5e1;
  }

  .order-status-badge.status-pink {
    background: #fce7f3;
    color: #be185d;
    border-color: #fbcfe8;
  }

  .order-filters {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .order-filters select {
    min-width: 160px;
  }

  .order-status-controls {
    min-width: 180px;
  }

  .order-status-controls > * {
    margin-bottom: 6px;
  }
</style>
`;

function getStatusClass(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.unknown;
}

function getStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status;
}

// Filter orders by channel and status
function filterOrders(items, source = '', status = '') {
  return (items || []).filter(order => {
    const sourceMatch = !source || order.source === source;
    const statusMatch = !status || (order.status || 'pending') === status;

    return sourceMatch && statusMatch;
  });
}

// Order Table
export function orderTable(items) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Channel</th>
            <th>Total</th>
            <th>Status</th>
            <th>Verification</th>
            <th>Update status</th>
          </tr>
        </thead>

        <tbody>
          ${
            items.map(o => {
              const current = String(o.status || 'pending');

              const statusClass = getStatusClass(current);
              const statusLabel = getStatusLabel(current);

              const options = [
                current,
                ...(ORDER_ALLOWED_NEXT[current] || [])
              ].map(v => `
                <option value="${esc(v)}" ${v === current ? 'selected' : ''}>
                  ${esc(getStatusLabel(v))}${v === current ? ' (Current)' : ''}
                </option>
              `).join('');

              const reasonOptions = FAILURE_REASONS.map(([v, l]) => `
                <option value="${esc(v)}" ${o.failureReason === v ? 'selected' : ''}>
                  ${esc(l)}
                </option>
              `).join('');

              return `
                <tr data-order-row="${esc(o.id)}">

                  <td>
                    <button
                      type="button"
                      class="order-details-link"
                      data-order-details="${esc(o.id)}"
                    >
                      ${esc(o.orderNo || o.id)}
                    </button>

                    <div class="muted">
                      ${esc(new Date(o.createdAt || Date.now()).toLocaleString())}
                    </div>
                  </td>

                  <td>
                    ${esc(o.customer?.name || '—')}
                    <div class="muted">
                      ${esc(o.customer?.phone || '')}
                    </div>
                  </td>

                  <td>
                    ${esc(o.source || '—')}
                  </td>

                  <td>
                    ${money(o.total)}
                  </td>

                  <td>
                    <span class="order-status-badge status-${statusClass}">
                      ${esc(statusLabel)}
                    </span>
                  </td>

                  <td>
                    ${esc(o.verification?.verdict || '—')}
                  </td>

                  <td>
                    <div
                      class="order-status-controls"
                      data-current-status="${esc(current)}"
                    >

                      <select data-order-status>
                        ${options}
                      </select>

                      <small class="muted">
                        Only valid next steps are available.
                      </small>

                      <div
                        data-failure-fields
                        style="display:${current === 'failed_delivery' ? 'block' : 'none'}"
                      >
                        <select data-failure-reason>
                          <option value="">Select failure reason</option>
                          ${reasonOptions}
                        </select>
                      </div>

                      <div
                        data-return-fields
                        style="display:none"
                      >
                        <select data-return-reason>
                          <option value="">Select return reason (required)</option>
                          <option value="customer_returned">Customer returned</option>
                          <option value="wrong_item">Wrong item</option>
                          <option value="damaged_item">Damaged item</option>
                          <option value="size_issue">Size issue</option>
                          <option value="other">Other</option>
                        </select>

                        <label class="small">
                          <input type="checkbox" data-return-received>
                          Parcel physically received at store
                        </label>
                      </div>

                      <textarea
                        data-status-note
                        rows="2"
                        maxlength="1000"
                        placeholder="Admin note (optional)"
                      ></textarea>

                      <button
                        type="button"
                        class="btn small"
                        data-save-order-status
                        disabled
                      >
                        Save
                      </button>

                    </div>
                  </td>

                </tr>
              `;
            }).join('') || `
              <tr>
                <td colspan="7" class="empty">
                  No orders found
                </td>
              </tr>
            `
          }
        </tbody>
      </table>
    </div>
  `;
}

// Bind Status Controls
export async function bindOrderStatusControls(root, api, toast) {
  root.querySelectorAll('[data-order-row]').forEach(row => {
    const status = row.querySelector('[data-order-status]');
    const fields = row.querySelector('[data-failure-fields]');
    const returnFields = row.querySelector('[data-return-fields]');
    const save = row.querySelector('[data-save-order-status]');

    const controls = row.querySelector('.order-status-controls');
    const current = controls.dataset.currentStatus;

    const updateControls = () => {
      fields.style.display =
        status.value === 'failed_delivery' ? 'block' : 'none';

      returnFields.style.display =
        status.value === 'returned' ? 'block' : 'none';

      save.disabled = status.value === current;
    };

    status.addEventListener('change', updateControls);
    updateControls();

    save.addEventListener('click', async () => {
      const body = {
        status: status.value,
        note: row.querySelector('[data-status-note]').value.trim()
      };

      if (status.value === 'failed_delivery') {
        body.failureReason =
          row.querySelector('[data-failure-reason]').value;

        if (!body.failureReason) {
          return toast('Select a failure reason');
        }
      }

      if (status.value === 'returned') {
        body.returnReason =
          row.querySelector('[data-return-reason]').value;

        body.returnReceived =
          row.querySelector('[data-return-received]').checked;

        if (!body.returnReason) {
          return toast('Return Reason বাধ্যতামূলক');
        }

        if (!body.returnReceived) {
          return toast('Parcel physically received নিশ্চিত করুন');
        }
      }

      save.disabled = true;

      try {
        const result = await api(
          `/api/orders/${encodeURIComponent(row.dataset.orderRow)}/status`,
          {
            method: 'PATCH',
            body: JSON.stringify(body)
          }
        );

        toast(
          result.stockReleasePending
            ? 'Status saved. Stock will be restored when parcel is received.'
            : `Order status updated: ${getStatusLabel(result.status)}`
        );

        const fresh = await api('/api/orders?limit=80');

        const table = root.querySelector('#ordersTable');

        if (table) {
          const source = root.querySelector('#source')?.value || '';
          const statusFilter = root.querySelector('#statusFilter')?.value || '';

          table.innerHTML = orderTable(
            filterOrders(fresh.items, source, statusFilter)
          );

          await bindOrderStatusControls(root, api, toast);
        }

      } catch (e) {
        toast(`Status update failed: ${e.message}`);
        save.disabled = false;
      }
    });
  });
}

// Render Orders Page
export async function renderOrders(root, { api, toast }) {
  const d = await api('/api/orders?limit=80');

  // Status filter options
  const statusOptions = Object.entries(ORDER_STATUS_LABELS)
    .map(([value, label]) => `
      <option value="${esc(value)}">${esc(label)}</option>
    `)
    .join('');

  root.innerHTML = STATUS_STYLES +
    head('Orders', 'Facebook orders এবং অন্যান্য sales channel') +

    `
      <div class="card">

        <div class="toolbar order-filters">

          <select id="source">
            <option value="">All channels</option>
            <option value="facebook">Facebook</option>
            <option value="web">Web</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="pos">POS</option>
          </select>

          <select id="statusFilter">
            <option value="">All Statuses</option>
            ${statusOptions}
          </select>

        </div>

        <div id="ordersTable">
          ${orderTable(d.items || [])}
        </div>

      </div>
    `;

  // Apply both filters
  const renderOrdersList = () => {
    const source = root.querySelector('#source').value;
    const status = root.querySelector('#statusFilter').value;

    const table = root.querySelector('#ordersTable');

    table.innerHTML = orderTable(
      filterOrders(d.items, source, status)
    );

    bindOrderStatusControls(root, api, toast);
  };

  root.querySelector('#source').addEventListener(
    'change',
    renderOrdersList
  );

  root.querySelector('#statusFilter').addEventListener(
    'change',
    renderOrdersList
  );

  // Order Details
  root.addEventListener('click', e => {
    const button = e.target.closest('[data-order-details]');

    if (button) {
      openOrderDetails(
        root,
        api,
        button.dataset.orderDetails,
        toast
      );
    }
  });

  bindOrderStatusControls(root, api, toast);
}
