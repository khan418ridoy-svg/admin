import { head, money, esc } from '../helpers.js';
import { productEditor } from './product-form.js';

export function productTable(items) {
  return `<div class="table-wrap"><table><thead><tr>
    <th>Product</th><th>Code / SKU</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th>
  </tr></thead><tbody>${items.map(p =>
    `<tr><td><div class="product-cell">
      ${p.mainImage ? `<img class="thumb" src="${esc(p.mainImage)}">` : '<div class="thumb"></div>'}
      <div><strong>${esc(p.name)}</strong>
        <div class="muted">${esc(p.brand || 'Nishat Fashion')}</div>
        <small class="muted">${esc(p.slug || '')}</small>
      </div>
    </div></td>
    <td>${esc(p.shortCode || '—')}<div class="muted">${esc(p.sku)}</div></td>
    <td>${money(p.minPrice || p.sellingPrice)}</td>
    <td>${p.totalStock ?? 0}</td>
    <td><select class="product-status-select" data-status-id="${esc(p.id)}">
      <option value="active" ${p.status === 'active' ? 'selected' : ''}>Active</option>
      <option value="inactive" ${p.status === 'inactive' ? 'selected' : ''}>Inactive</option>
      <option value="draft" ${p.status === 'draft' ? 'selected' : ''}>Draft</option>
    </select></td>
    <td><button class="btn outline" data-edit="${esc(p.id)}">Edit</button></td>
  </tr>`).join('') || '<tr><td colspan="6" class="empty">No products found</td></tr>'}</tbody></table></div>`;
}

export async function bindProductStatusControls(root, api, toast) {
  root.querySelectorAll('[data-status-id]').forEach(select => {
    select.addEventListener('change', async () => {
      const previous = select.dataset.previous || 'draft';
      select.disabled = true;
      try {
        await api(`/api/products/${encodeURIComponent(select.dataset.statusId)}/status`, {
          method: 'PATCH', body: JSON.stringify({ status: select.value })
        });
        select.dataset.previous = select.value;
        toast(`Status updated: ${select.value}`);
      } catch (e) {
        select.value = previous;
        toast(`Status update failed: ${e.message}`);
      } finally {
        select.disabled = false;
      }
    });
    select.dataset.previous = select.value;
  });
}

export async function renderProducts(root, { api, toast, renderPage }) {
  const d = await api('/api/products?limit=50');
  root.innerHTML = head('Products', 'প্রোডাক্ট, SKU, short code এবং stock পরিচালনা', '<button class="btn">+ Add product</button>')
    + `<div class="card">
        <div class="toolbar">
          <input id="search" placeholder="Search name / SKU / product code">
          <select id="status">
            <option value="">All status</option>
            <option>active</option>
            <option>inactive</option>
            <option>draft</option>
          </select>
        </div>
        <div id="productTable">${productTable(d.items || [])}</div>
      </div>`;

  document.querySelector('.page-head .btn').onclick = () => productEditor(root, api, toast);
  const filter = () => {
    const q = document.getElementById('search').value.toLowerCase();
    const st = document.getElementById('status').value;
    document.getElementById('productTable').innerHTML = productTable(
      (d.items || []).filter(p => (!st || p.status === st) && [p.name, p.sku, p.shortCode].join(' ').toLowerCase().includes(q))
    );
    bindProductStatusControls(root, api, toast);
  };
  document.getElementById('search').oninput = filter;
  document.getElementById('status').onchange = filter;
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => productEditor(root, api, toast, b.dataset.edit));
  bindProductStatusControls(root, api, toast);
}