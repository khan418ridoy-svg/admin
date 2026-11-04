import { head, money, esc } from '../helpers.js';
import { orderTable } from './order.js';
import { openOrderDetails } from './order-details.js';

export async function renderDashboard(root, { api, toast }) {
  const d = await api('/api/dashboard');
  const s = d.stats;
  const stats = [
    ['Today orders', s.todayOrders || 0, 'আজকের অর্ডার'],
    ['Today sales', money(s.todaySales), 'আজকের বিক্রি'],
    ['Pending orders', s.pendingOrders || 0, 'কনফার্মের অপেক্ষায়'],
    ['Low stock', s.lowStock || d.lowStock.length, 'স্টক সতর্কতা']
  ];

  root.innerHTML = head('Dashboard', 'আপনার Nishat Fashion store-এর আজকের সারসংক্ষেপ')
    + `<div class="grid stats">${stats.map(([a, b, c]) =>
        `<article class="card"><div class="stat-top"><span>${a}</span><span>↗</span></div>
        <div class="stat-value">${b}</div><div class="stat-note">${c}</div></article>`
      ).join('')}</div>
    <div class="grid two-col">
      <article class="card"><h3 class="section-title">Recent orders</h3>${orderTable(d.recentOrders || [])}</article>
      <article class="card"><h3 class="section-title">Low stock products</h3>
        ${(d.lowStock || []).map(p => `<p>${esc(p.name)} <span class="badge amber">${p.totalStock || 0} left</span></p>`).join('') || '<div class="empty">No low stock alerts</div>'}
      </article>
    </div>`;

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-order-details]');
    if (b) openOrderDetails(root, api, b.dataset.orderDetails, toast);
  });
}