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
    <td><div class="product-actions"><button type="button" class="btn outline" data-edit="${esc(p.id)}">Edit</button><button type="button" class="btn secondary" data-add-stock="${esc(p.id)}">Add Stock</button></div></td>
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


function stockModalHtml(product, lots) {
  const variants = Object.entries(product.variants || {});
  const options = variants.map(([sku, v]) =>
    `<option value="${esc(sku)}">${esc(v.color)} / ${esc(v.size)} · ${esc(sku)} (Current: ${Number(v.stock || 0)})</option>`
  ).join('');
  const existingLots = (lots || []).map(l =>
    `<option value="${esc(l.id)}">${esc(l.lotNo || l.id)}</option>`
  ).join('');
  return `<div class="stock-modal-backdrop" data-stock-backdrop>
    <section class="stock-modal card" role="dialog" aria-modal="true" aria-labelledby="stockModalTitle">
      <div class="stock-modal-head"><div><h2 id="stockModalTitle">Add stock — ${esc(product.name || '')}</h2><p class="muted">Variant-wise stock এবং Lot নির্বাচন করুন</p></div><button type="button" class="btn outline" data-stock-close>✕</button></div>
      <div class="form-grid">
        <div class="field"><label>Lot option</label><select id="stockLotMode"><option value="new">Create new lot</option><option value="existing">Add to existing lot</option></select></div>
        <div class="field" id="newLotField"><label>New Lot No *</label><input id="stockLotNo" placeholder="LOT-002" maxlength="40"></div>
        <div class="field hidden" id="existingLotField"><label>Select existing lot *</label><select id="stockExistingLot"><option value="">Select lot</option>${existingLots}</select></div>
        <div class="field"><label>Note (optional)</label><input id="stockNote" maxlength="500" placeholder="Supplier / purchase reference"></div>
      </div>
      <div class="stock-entry-toolbar"><strong>Stock entries</strong><button type="button" class="btn secondary small" id="addStockRow">+ Add variant row</button></div>
      <div class="table-wrap"><table class="stock-entry-table"><thead><tr><th>Variant</th><th>New variant details</th><th>Qty</th><th></th></tr></thead><tbody id="stockEntryRows"></tbody></table></div>
      <div class="stock-modal-foot"><button type="button" class="btn outline" data-stock-close>Cancel</button><button type="button" class="btn" id="saveStockBtn">Add stock</button></div>
    </section>
  </div>`;
}

function stockEntryRow(product, selectedSku = '', initialQty = 1) {
  const options = Object.entries(product.variants || {}).map(([sku, v]) =>
    `<option value="${esc(sku)}" ${sku === selectedSku ? 'selected' : ''}>${esc(v.color)} / ${esc(v.size)} · ${esc(sku)}</option>`
  ).join('');
  return `<tr>
    <td><select data-stock-variant><option value="">Select variant</option>${options}<option value="__new__">+ Create new variant</option></select></td>
    <td><div class="new-variant-fields hidden">
      <input data-new-color placeholder="Color" aria-label="New variant color">
      <input data-new-size placeholder="Size" aria-label="New variant size">
      <input data-new-regular type="number" min="0" placeholder="Regular price">
      <input data-new-selling type="number" min="0" placeholder="Selling price">
    </div><span class="muted existing-variant-hint">Choose an existing variant or create a new one</span></td>
    <td><input data-stock-qty type="number" min="0" step="1" value="${initialQty}" aria-label="Quantity"></td>
    <td><button type="button" class="btn danger small" data-remove-stock-row>Remove</button></td>
  </tr>`;
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


  table.addEventListener('click', async e => {
    const button = e.target.closest('[data-add-stock]');
    if (!button) return;
    button.disabled = true;
    try {
      const id = button.dataset.addStock;
      const [stockData, lotData] = await Promise.all([
        api(`/api/products/${encodeURIComponent(id)}/stock`),
        api('/api/lots')
      ]);
      const product = stockData.product || {};
      root.insertAdjacentHTML('beforeend', stockModalHtml(product, lotData.items || []));
      const modal = root.querySelector('[data-stock-backdrop]');
      const rows = modal.querySelector('#stockEntryRows');
      // Show every existing variant immediately; quantity 0 means 'do not add stock'.
      const existingVariants = Object.keys(product.variants || {});
      existingVariants.forEach(sku => rows.insertAdjacentHTML('beforeend', stockEntryRow(product, sku, 0)));
      if (!existingVariants.length) rows.insertAdjacentHTML('beforeend', stockEntryRow(product, '', 1));
      const addRow = () => rows.insertAdjacentHTML('beforeend', stockEntryRow(product, '', 1));

      modal.querySelectorAll('[data-stock-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
      modal.querySelector('#stockLotMode').addEventListener('change', e => {
        const existing = e.target.value === 'existing';
        modal.querySelector('#newLotField').classList.toggle('hidden', existing);
        modal.querySelector('#existingLotField').classList.toggle('hidden', !existing);
      });
      modal.querySelector('#addStockRow').addEventListener('click', addRow);
      rows.addEventListener('change', e => {
        if (!e.target.matches('[data-stock-variant]')) return;
        const isNew = e.target.value === '__new__';
        const tr = e.target.closest('tr');
        tr.querySelector('.new-variant-fields').classList.toggle('hidden', !isNew);
        tr.querySelector('.existing-variant-hint').classList.toggle('hidden', isNew);
      });
      rows.addEventListener('click', e => {
        const remove = e.target.closest('[data-remove-stock-row]');
        if (remove) {
          if (rows.children.length === 1) return toast('At least one stock entry is required');
          remove.closest('tr').remove();
        }
      });
      modal.querySelector('#saveStockBtn').addEventListener('click', async saveButtonEvent => {
        const saveButton = saveButtonEvent.currentTarget;
        const mode = modal.querySelector('#stockLotMode').value;
        const allEntries = [...rows.querySelectorAll('tr')].map(tr => {
          const selected = tr.querySelector('[data-stock-variant]').value;
          const qtyInput = tr.querySelector('[data-stock-qty]');
          const qty = Number(qtyInput.value || 0);
          if (selected === '__new__') {
            return { newVariant: {
              color: tr.querySelector('[data-new-color]').value.trim(),
              size: tr.querySelector('[data-new-size]').value.trim(),
              regularPrice: Number(tr.querySelector('[data-new-regular]').value || 0),
              sellingPrice: Number(tr.querySelector('[data-new-selling]').value || 0)
            }, qty };
          }
          return { variantSku: selected, qty };
        });
        // Existing variants are pre-listed with quantity 0; only positive quantities are submitted.
        const entries = allEntries.filter(x => x.qty > 0);
        if (!entries.length) return toast('কমপক্ষে একটি Variant-এর Qty দিন');
        if (entries.some(x => (!x.variantSku && !x.newVariant) || !Number.isSafeInteger(x.qty) || x.qty <= 0)) return toast('প্রতিটি নির্বাচিত row-তে Variant এবং সঠিক Qty দিন');
        const skus = entries.filter(x => x.variantSku).map(x => x.variantSku);
        if (new Set(skus).size !== skus.length) return toast('একই Variant একাধিকবার যোগ করা যাবে না');
        const payload = {
          lotMode: mode,
          lotNo: modal.querySelector('#stockLotNo').value.trim(),
          lotId: modal.querySelector('#stockExistingLot').value,
          note: modal.querySelector('#stockNote').value.trim(),
          entries
        };
        if (mode === 'new' && !payload.lotNo) return toast('Lot No দিন');
        if (mode === 'existing' && !payload.lotId) return toast('একটি Lot নির্বাচন করুন');
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
        try {
          const result = await api(`/api/products/${encodeURIComponent(id)}/stock`, {
            method: 'POST', body: JSON.stringify(payload)
          });
          toast(`Stock added to ${result.lotNo}. Total stock: ${result.totalStock}`);
          modal.remove();
          await renderProducts(root, { api, toast, renderPage });
        } catch (err) {
          toast(`Stock update failed: ${err.message}`);
          saveButton.disabled = false;
          saveButton.textContent = 'Add stock';
        }
      });
    } catch (err) {
      toast(`Could not open stock manager: ${err.message}`);
    } finally {
      button.disabled = false;
    }
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
