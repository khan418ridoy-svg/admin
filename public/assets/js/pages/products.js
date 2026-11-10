import { head } from '../helpers.js';
import { productEditor } from './product-form.js';
import { productTable, bindProductStatusControls } from './product-table.js';
import { openProductView } from './product-view-modal.js';
import { openStockModal } from './product-stock-modal.js';
import { reviewOf, applyReviewBadge, friendlyError, skipReasonText } from './product-review.js';

// Other files may still import these from products.js
export { productTable, bindProductStatusControls };

export async function renderProducts(root, { api, toast, renderPage }) {
  const d = await api('/api/products?limit=100');
  const allProducts = Array.isArray(d.items) ? d.items : [];
  let visible = allProducts;

  root.innerHTML = head('Products', 'প্রোডাক্ট, SKU, barcode, short code এবং stock পরিচালনা', '<button type="button" class="btn" id="addProductBtn">+ Add product</button>')
    + `<div class="card">
        <div class="toolbar">
          <input id="productSearch" type="search" placeholder="Search name / SKU / code / barcode">
          <select id="productStatusFilter">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="draft">Draft</option>
          </select>
          <select id="productReviewFilter">
            <option value="">All review</option>
            <option value="ok">✔ OK</option>
            <option value="not_ok">✖ Not OK</option>
            <option value="pending">● Unchecked</option>
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
  const reviewFilter = root.querySelector('#productReviewFilter');
  const reload = () => renderProducts(root, { api, toast, renderPage });

  const searchText = p => [
    p.name, p.sku, p.shortCode, p.slug, p.brand, p.barcode,
    ...Object.values(p.variants || {}).flatMap(v => [v.variantSku, v.barcode])
  ].filter(Boolean).join(' ').toLowerCase();

  function drawTable() {
    const term = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;
    const review = reviewFilter.value;
    visible = allProducts.filter(p =>
      (!status || String(p.status || 'draft').toLowerCase() === status) &&
      (!review || reviewOf(p) === review) &&
      (!term || searchText(p).includes(term))
    );
    table.innerHTML = productTable(visible);
    bindProductStatusControls(table, api, toast, (id, next) => {
      const p = allProducts.find(x => x.id === id);
      if (p) p.status = next;
    });

    const selectAll = table.querySelector('#selectAllProducts');
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        table.querySelectorAll('.product-checkbox').forEach(cb => { cb.checked = selectAll.checked; });
      });
    }
  }

  function openEditor(id, button) {
    if (button) button.disabled = true;
    productEditor(root, api, toast, id)
      .catch(err => toast(`Could not open product form: ${err.message}`))
      .finally(() => { if (button) button.disabled = false; });
  }

  root.querySelector('#addProductBtn').addEventListener('click', () => openEditor(undefined));

  // One delegated listener for every row button (works after each table redraw).
  table.addEventListener('click', async e => {
    const btn = e.target.closest('[data-edit],[data-view],[data-add-stock]');
    if (!btn) return;

    if (btn.dataset.edit) return openEditor(btn.dataset.edit, btn);

    if (btn.dataset.view) {
      const index = visible.findIndex(p => p.id === btn.dataset.view);
      if (index < 0) return;
      return openProductView({
        root, api, toast, products: visible, index,
        // Only the badge is refreshed, so selected checkboxes stay as they are.
        onReviewChanged: p => root.querySelectorAll(`[data-review-badge="${CSS.escape(String(p.id))}"]`).forEach(el => applyReviewBadge(el, p)),
        onEdit: id => openEditor(id)
      });
    }

    if (btn.dataset.addStock) {
      btn.disabled = true;
      try {
        await openStockModal({ root, api, toast, id: btn.dataset.addStock, onSaved: reload });
      } catch (err) {
        toast(`Could not open stock manager: ${friendlyError(err)}`);
      } finally {
        btn.disabled = false;
      }
    }
  });

  searchInput.addEventListener('input', drawTable);
  statusFilter.addEventListener('change', drawTable);
  reviewFilter.addEventListener('change', drawTable);

  root.querySelector('#applyBulk').addEventListener('click', async () => {
    const action = root.querySelector('#bulkAction').value;
    if (!action) return toast('Select a bulk action first');
    const ids = [...table.querySelectorAll('.product-checkbox:checked')].map(cb => cb.value);
    if (!ids.length) return toast('No products selected');

    const button = root.querySelector('#applyBulk');
    button.disabled = true;
    button.textContent = 'Applying...';
    try {
      const res = await api('/api/products/bulk-status', {
        method: 'PATCH', body: JSON.stringify({ ids, status: action })
      });
      const skipped = res.skipped || [];
      if (skipped.length) {
        const reasons = [...new Set(skipped.map(s => skipReasonText(s.reason)))].join(' / ');
        toast(`${res.count} টি ${action} হয়েছে, ${skipped.length} টি skip হয়েছে: ${reasons}`);
      } else {
        toast(`Successfully updated ${res.count} products to ${action}`);
      }
      await reload();
    } catch (e) {
      toast(`Bulk update failed: ${friendlyError(e)}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Apply';
    }
  });

  drawTable();
}
