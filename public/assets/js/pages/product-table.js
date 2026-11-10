import { money, esc } from '../helpers.js';
import { reviewBadge, friendlyError } from './product-review.js';

export function productTable(items) {
  return `<div class="table-wrap"><table><thead><tr>
    <th><input type="checkbox" id="selectAllProducts"></th>
    <th>Product</th><th>Code / SKU / Barcode</th><th>Price</th><th>Stock</th><th>Review</th><th>Status</th><th>Actions</th>
  </tr></thead><tbody>${items.map(p =>
    `<tr><td><input type="checkbox" class="product-checkbox" value="${esc(p.id)}"></td>
    <td><div class="product-cell">
      ${p.mainImage ? `<img class="thumb" src="${esc(p.mainImage)}" alt="${esc(p.name)}">` : '<div class="thumb"></div>'}
      <div><strong>${esc(p.name)}</strong>
        <div class="muted">${esc(p.brand || 'Nishat Fashion')}</div>
        <small class="muted">${esc(p.slug || '')}</small>
      </div>
    </div></td>
    <td>${esc(p.shortCode || '—')}<div class="muted">${esc(p.sku || '')}</div>${p.barcode ? `<small class="muted">▮ ${esc(p.barcode)}</small>` : ''}</td>
    <td>${money(p.minPrice || p.sellingPrice)}</td>
    <td>${p.totalStock ?? 0}</td>
    <td>${reviewBadge(p)}</td>
    <td><select class="product-status-select" data-status-id="${esc(p.id)}">
      <option value="active" ${p.status === 'active' ? 'selected' : ''}>Active</option>
      <option value="inactive" ${p.status === 'inactive' ? 'selected' : ''}>Inactive</option>
      <option value="draft" ${p.status === 'draft' ? 'selected' : ''}>Draft</option>
    </select></td>
    <td><div class="product-actions">
      <button type="button" class="btn outline" data-view="${esc(p.id)}">View</button>
      <button type="button" class="btn outline" data-edit="${esc(p.id)}">Edit</button>
      <button type="button" class="btn secondary" data-add-stock="${esc(p.id)}">Add Stock</button>
    </div></td>
  </tr>`).join('') || '<tr><td colspan="8" class="empty">No products found</td></tr>'}</tbody></table></div>`;
}

// onChanged(id, newStatus) is called after the server accepted the change.
export function bindProductStatusControls(scope, api, toast, onChanged = () => {}) {
  scope.querySelectorAll('[data-status-id]').forEach(select => {
    select.dataset.previous = select.value;
    select.addEventListener('change', async () => {
      const previous = select.dataset.previous || 'draft';
      select.disabled = true;
      try {
        await api(`/api/products/${encodeURIComponent(select.dataset.statusId)}/status`, {
          method: 'PATCH', body: JSON.stringify({ status: select.value })
        });
        select.dataset.previous = select.value;
        onChanged(select.dataset.statusId, select.value);
        toast(`Status updated: ${select.value}`);
      } catch (e) {
        select.value = previous;
        toast(`Status update failed: ${friendlyError(e)}`);
      } finally {
        select.disabled = false;
      }
    });
  });
}
