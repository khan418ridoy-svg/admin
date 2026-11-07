import { head, money, esc } from '../helpers.js';
import { productEditor } from './product-form.js';
export function productTable(items) {
  return `<div class="table-wrap"><table><thead><tr>
    <th><input type="checkbox" id="selectAllProducts"></th>
    <th>Product</th><th>Code / SKU</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th>
  </tr></thead><tbody>${items.map(p =>
    `<tr><td><input type="checkbox" class="product-checkbox" value="${esc(p.id)}"></td>
    <td><div class="product-cell">
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
  </tr>`).join('') || '<tr><td colspan="7" class="empty">No products found</td></tr>'}</tbody></table></div>`;
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
          <select id="bulkAction">
            <option value="">Bulk Action</option>
            <option value="active">Make Active</option>
            <option value="inactive">Make Inactive</option>
            <option value="draft">Make Draft</option>
          </select>
          <button class="btn secondary" id="applyBulk">Apply</button>
        </div>
        <div id="productTable">${productTable(d.items || [])}</div>
      </div>`;

  document.querySelector('.page-head .btn').onclick = () => productEditor(root, api, toast);
  
  // Bulk Checkbox Logic
  const selectAll = root.querySelector('#selectAllProducts');
  if (selectAll) {
    selectAll.onchange = (e) => {
      root.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = e.target.checked);
    };
  }

  // Bulk Apply Button
  root.querySelector('#applyBulk').onclick = async () => {
    const action = root.querySelector('#bulkAction').value;
    if (!action) return toast('Select a bulk action first');
    const ids = [...root.querySelectorAll('.product-checkbox:checked')].map(cb => cb.value);
    if (!ids.length) return toast('No products selected');

    const b = root.querySelector('#applyBulk');
    b.disabled = true;
    b.textContent = 'Applying...';
    try {
      await api('/api/products/bulk-status', { method: 'PATCH', body: JSON.stringify({ ids, status: action }) });
      toast(`Successfully updated ${ids.length} products to ${action}`);
      renderProducts(root, { api, toast, renderPage }); // পেজ রিফ্রেশ
    } catch (e) {
      toast(`Failed: ${e.message}`);
    } finally {
      b.disabled = false;
      b.textContent = 'Apply';
    }
  };
  
  // ... বাকি ফিল্টারিং লজিক আগের মতোই থাকবে
}