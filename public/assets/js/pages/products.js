import { head, money, esc } from '../helpers.js';
import { productEditor } from './product-form.js';

export function productTable(items) {
  return `<div class="table-wrap"><table><thead><tr>
    <th><input type="checkbox" id="selectAllProducts"></th>
    <th>Product</th><th>Code / SKU</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th>
  </tr></thead><tbody>${items.map(p =>
    `<tr><td><input type="checkbox" class="product-checkbox" value="${esc(p.id)}"></td>
    <td><div class="product-cell">
      ${p.mainImage ? `<img class="thumb" src="${esc(p.mainImage)}" alt="${esc(p.name)}">` : '<div class="thumb"></div>'}
      <div><strong>${esc(p.name)}</strong>
        <div class="muted">${esc(p.brand || 'Nishat Fashion')}</div>
        <small class="muted">${esc(p.slug || '')}</small>
      </div>
    </div></td>
    <td>${esc(p.shortCode || '—')}<div class="muted">${esc(p.sku || '')}</div></td>
    <td>${money(p.minPrice || p.sellingPrice)}</td>
    <td>${p.totalStock ?? 0}</td>
    <td><select class="product-status-select" data-status-id="${esc(p.id)}">
      <option value="active" ${p.status === 'active' ? 'selected' : ''}>Active</option>
      <option value="inactive" ${p.status === 'inactive' ? 'selected' : ''}>Inactive</option>
      <option value="draft" ${p.status === 'draft' ? 'selected' : ''}>Draft</option>
    </select></td>
    <td><button type="button" class="btn outline" data-edit="${esc(p.id)}">Edit</button></td>
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
  const d = await api('/api/products?limit=100');
  const allProducts = Array.isArray(d.items) ? d.items : [];

  root.innerHTML = head('Products', 'প্রোডাক্ট, SKU, short code এবং stock পরিচালনা', '<button type="button" class="btn" id="addProductBtn">+ Add product</button>')
    + `<div class="card">
        <div class="toolbar">
          <input id="productSearch" type="search" placeholder="Search name / SKU / product code">
          <select id="productStatusFilter">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="draft">Draft</option>
          </select>
          <select id="bulkAction">
            <option value="">Bulk Action</option>
            <option value="active">Make Active</option>
            <option value="inactive">Make Inactive</option>
            <option value="draft">Make Draft</option>
          </select>
          <button type="button" class="btn secondary" id="applyBulk">Apply</button>
        </div>
        <div id="productTable"></div>
      </div>`;

  const table = root.querySelector('#productTable');
  const searchInput = root.querySelector('#productSearch');
  const statusFilter = root.querySelector('#productStatusFilter');

  function drawTable() {
    const term = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;
    const filtered = allProducts.filter(p => {
      const matchesStatus = !status || String(p.status || 'draft').toLowerCase() === status;
      const searchable = [p.name, p.sku, p.shortCode, p.slug, p.brand]
        .filter(Boolean).join(' ').toLowerCase();
      return matchesStatus && (!term || searchable.includes(term));
    });
    table.innerHTML = productTable(filtered);
    bindProductStatusControls(root, api, toast);

    const selectAll = table.querySelector('#selectAllProducts');
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        table.querySelectorAll('.product-checkbox').forEach(cb => { cb.checked = selectAll.checked; });
      });
    }
  }

  root.querySelector('#addProductBtn').addEventListener('click', () => {
    productEditor(root, api, toast).catch(e => toast(`Could not open product form: ${e.message}`));
  });

  // Edit button: delegated listener works after every table redraw.
  table.addEventListener('click', e => {
    const button = e.target.closest('[data-edit]');
    if (!button) return;
    const id = button.dataset.edit;
    button.disabled = true;
    productEditor(root, api, toast, id)
      .catch(err => toast(`Could not open product: ${err.message}`))
      .finally(() => { button.disabled = false; });
  });

  searchInput.addEventListener('input', drawTable);
  statusFilter.addEventListener('change', drawTable);

  root.querySelector('#applyBulk').addEventListener('click', async () => {
    const action = root.querySelector('#bulkAction').value;
    if (!action) return toast('Select a bulk action first');
    const ids = [...table.querySelectorAll('.product-checkbox:checked')].map(cb => cb.value);
    if (!ids.length) return toast('No products selected');

    const button = root.querySelector('#applyBulk');
    button.disabled = true;
    button.textContent = 'Applying...';
    try {
      await api('/api/products/bulk-status', {
        method: 'PATCH', body: JSON.stringify({ ids, status: action })
      });
      toast(`Successfully updated ${ids.length} products to ${action}`);
      await renderProducts(root, { api, toast, renderPage });
    } catch (e) {
      toast(`Bulk update failed: ${e.message}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Apply';
    }
  });

  drawTable();
}
