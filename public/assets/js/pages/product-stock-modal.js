import { esc } from '../helpers.js';
import { friendlyError } from './product-review.js';

function stockModalHtml(product, lots) {
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

function readEntries(rows) {
  return [...rows.querySelectorAll('tr')].map(tr => {
    const selected = tr.querySelector('[data-stock-variant]').value;
    const qty = Number(tr.querySelector('[data-stock-qty]').value || 0);
    if (selected === '__new__') {
      return {
        newVariant: {
          color: tr.querySelector('[data-new-color]').value.trim(),
          size: tr.querySelector('[data-new-size]').value.trim(),
          regularPrice: Number(tr.querySelector('[data-new-regular]').value || 0),
          sellingPrice: Number(tr.querySelector('[data-new-selling]').value || 0)
        }, qty
      };
    }
    return { variantSku: selected, qty };
  });
}

// Opens the lot-wise stock popup. onSaved() runs after a successful save.
export async function openStockModal({ root, api, toast, id, onSaved }) {
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

  modal.querySelectorAll('[data-stock-close]').forEach(b => b.addEventListener('click', () => modal.remove()));
  modal.querySelector('#stockLotMode').addEventListener('change', ev => {
    const existing = ev.target.value === 'existing';
    modal.querySelector('#newLotField').classList.toggle('hidden', existing);
    modal.querySelector('#existingLotField').classList.toggle('hidden', !existing);
  });
  modal.querySelector('#addStockRow').addEventListener('click', () => rows.insertAdjacentHTML('beforeend', stockEntryRow(product, '', 1)));
  rows.addEventListener('change', ev => {
    if (!ev.target.matches('[data-stock-variant]')) return;
    const isNew = ev.target.value === '__new__';
    const tr = ev.target.closest('tr');
    tr.querySelector('.new-variant-fields').classList.toggle('hidden', !isNew);
    tr.querySelector('.existing-variant-hint').classList.toggle('hidden', isNew);
  });
  rows.addEventListener('click', ev => {
    const remove = ev.target.closest('[data-remove-stock-row]');
    if (!remove) return;
    if (rows.children.length === 1) return toast('At least one stock entry is required');
    remove.closest('tr').remove();
  });

  modal.querySelector('#saveStockBtn').addEventListener('click', async ev => {
    const saveButton = ev.currentTarget;
    const mode = modal.querySelector('#stockLotMode').value;
    // Existing variants are pre-listed with quantity 0; only positive quantities are submitted.
    const entries = readEntries(rows).filter(x => x.qty > 0);
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
      const result = await api(`/api/products/${encodeURIComponent(id)}/stock`, { method: 'POST', body: JSON.stringify(payload) });
      toast(`Stock added to ${result.lotNo}. Total stock: ${result.totalStock}`);
      modal.remove();
      await onSaved();
    } catch (err) {
      toast(`Stock update failed: ${friendlyError(err)}`);
      saveButton.disabled = false;
      saveButton.textContent = 'Add stock';
    }
  });
}
