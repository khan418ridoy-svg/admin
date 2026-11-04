import { head, esc } from '../helpers.js';

export async function renderCoupons(root, { api, toast }) {
  let kind = 'general', couponItems = [];

  const renderRows = () => {
    const rows = root.querySelector('#couponRows');
    rows.innerHTML = couponItems.map(c => {
      const special = c.type === 'special';
      const usersCell = special
        ? `<span>${esc(c.targetPhone || '—')}</span>`
        : `<button class="btn outline small" data-users="${esc(c.code)}">Collected users (${Number(c.collectedCount || 0)})</button>`;
      return `<tr data-code="${esc(c.code)}">
        <td><strong>${esc(c.code)}</strong></td>
        <td>${Number(c.claimedCount ?? c.initialCount ?? c.collectedCount ?? 0)} <small class="muted">(actual: ${Number(c.collectedCount || 0)})</small></td>
        <td>${Number(c.usedCount || 0)}</td>
        <td>${Number(special ? c.usageLimit : c.maximumUses ?? c.usageLimit ?? 0)}</td>
        <td>${c.active ? 'Active' : 'Inactive'}</td>
        <td>${usersCell}</td>
        <td><button class="btn outline small" data-edit="${esc(c.code)}">Edit</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">No coupons found</td></tr>';
  };

  const load = async () => {
    const r = await api(`/api/coupons?type=${kind}&limit=100`);
    couponItems = r.items || [];
    root.querySelector('#couponUsers').hidden = true;
    root.querySelector('#couponUsers').innerHTML = '';
    renderRows();
  };

  root.innerHTML = head('Coupon Management', 'General ও Special Coupon আলাদাভাবে পরিচালনা করুন') + `
    <div class="grid two-col">
      <form class="card" id="couponCreate">
        <h3 class="section-title" id="couponFormTitle">Create Coupon</h3>
        <div class="field"><label>Coupon Code</label><input name="code" required placeholder="WELCOME10"></div>
        <div class="field"><label>Type</label><select name="type" id="couponType">
          <option value="general">General</option><option value="special">Special</option>
        </select></div>
        <div class="field" id="targetPhoneField" hidden><label>Target Phone (Special only)</label><input name="targetPhone" placeholder="01XXXXXXXXX"></div>
        <div class="field"><label>Discount %</label><input name="discountPercent" type="number" min="1" max="100" value="10" required></div>
        <div class="field"><label>Maximum Discount (৳)</label><input name="maxDiscount" type="number" min="0" value="200" required></div>
        <div class="field"><label>Minimum Purchase (৳)</label><input name="minPurchase" type="number" min="0" value="1000" required></div>
        <div class="field"><label>Expiry (optional)</label><input name="expiresAt" type="datetime-local"></div>
        <div class="field" id="maximumUsesField"><label>Maximum Uses (global)</label><input name="maximumUses" type="number" min="1" value="1000"></div>
        <div class="field" id="initialCountField"><label>Initial Count</label><input name="initialCount" type="number" min="0" value="0"><small class="muted">Customer Website counter-এর starting value।</small></div>
        <div class="field" id="specialUsesField" hidden><label>Usage Limit per phone</label><input name="usageLimit" type="number" min="1" value="1"></div>
        <div class="field"><label><input name="active" type="checkbox" checked> Active</label></div>
        <div class="toolbar">
          <button class="btn" id="couponSubmit">Create coupon</button>
          <button class="btn outline" type="button" id="couponCancelEdit" hidden>Cancel edit</button>
        </div>
      </form>
      <div class="card">
        <h3 class="section-title">Created Coupons</h3>
        <div class="toolbar">
          <button class="btn" id="generalTab">General Coupons</button>
          <button class="btn outline" id="specialTab">Special Coupons</button>
        </div>
        <div class="table-wrap"><table><thead><tr>
          <th>Code</th><th>Collected</th><th>Used</th><th>Maximum Uses</th><th>Status</th><th>Phone / Users</th><th>Action</th>
        </tr></thead><tbody id="couponRows"><tr><td colspan="7">Loading…</td></tr></tbody></table></div>
        <div id="couponUsers" class="notice" hidden></div>
      </div>
    </div>`;

  const formEl = root.querySelector('#couponCreate'), typeSelect = root.querySelector('#couponType');
  let editingCode = null;

  const syncCouponType = () => {
    const special = typeSelect.value === 'special';
    root.querySelector('#targetPhoneField').hidden = !special;
    root.querySelector('#maximumUsesField').hidden = special;
    root.querySelector('#initialCountField').hidden = special;
    root.querySelector('#specialUsesField').hidden = !special;
    formEl.elements.targetPhone.required = special;
  };

  const resetForm = () => {
    editingCode = null;
    formEl.reset();
    formEl.elements.active.checked = true;
    formEl.elements.code.readOnly = false;
    formEl.elements.type.disabled = false;
    root.querySelector('#couponFormTitle').textContent = 'Create Coupon';
    root.querySelector('#couponSubmit').textContent = 'Create coupon';
    root.querySelector('#couponCancelEdit').hidden = true;
    syncCouponType();
  };

  const beginEdit = code => {
    const c = couponItems.find(x => x.code === code);
    if (!c) return;
    editingCode = code;
    formEl.elements.code.value = c.code || '';
    formEl.elements.code.readOnly = true;
    formEl.elements.type.disabled = true;
    formEl.elements.type.value = c.type || 'general';
    formEl.elements.targetPhone.value = c.targetPhone || '';
    formEl.elements.discountPercent.value = Number(c.discountPercent || 0);
    formEl.elements.maxDiscount.value = Number(c.maxDiscount || 0);
    formEl.elements.minPurchase.value = Number(c.minPurchase || 0);
    formEl.elements.expiresAt.value = c.expiresAt ? new Date(Number(c.expiresAt)).toISOString().slice(0, 16) : '';
    formEl.elements.maximumUses.value = Number(c.maximumUses ?? c.usageLimit ?? 1000);
    formEl.elements.initialCount.value = Number(c.initialCount ?? 0);
    formEl.elements.usageLimit.value = Number(c.usageLimit || 1);
    formEl.elements.active.checked = c.active === true;
    root.querySelector('#couponFormTitle').textContent = `Edit Coupon — ${code}`;
    root.querySelector('#couponSubmit').textContent = 'Save changes';
    root.querySelector('#couponCancelEdit').hidden = false;
    syncCouponType();
    formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  typeSelect.onchange = syncCouponType;
  syncCouponType();
  root.querySelector('#couponCancelEdit').onclick = resetForm;

  formEl.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(formEl), payload = Object.fromEntries(f);
    payload.type = typeSelect.value;
    payload.discountPercent = Number(payload.discountPercent);
    payload.maxDiscount = Number(payload.maxDiscount);
    payload.minPurchase = Number(payload.minPurchase);
    payload.maximumUses = Number(payload.maximumUses || 1000);
    payload.initialCount = Number(payload.initialCount || 0);
    payload.usageLimit = Number(payload.usageLimit || 1);
    payload.active = f.has('active');
    payload.expiresAt = payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null;
    if (!payload.targetPhone) delete payload.targetPhone;
    try {
      if (editingCode) {
        await api(`/api/coupons/${encodeURIComponent(editingCode)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('Coupon updated');
      } else {
        await api('/api/coupons', { method: 'POST', body: JSON.stringify(payload) });
        toast('Coupon created');
      }
      resetForm();
      await load();
    } catch (err) {
      toast(`Coupon save failed: ${err.message}`);
    }
  };

  const switchTab = async next => {
    kind = next;
    root.querySelector('#generalTab').className = next === 'general' ? 'btn' : 'btn outline';
    root.querySelector('#specialTab').className = next === 'special' ? 'btn' : 'btn outline';
    root.querySelector('#couponUsers').hidden = true;
    root.querySelector('#couponUsers').innerHTML = '';
    if (editingCode) resetForm();
    await load();
  };
  root.querySelector('#generalTab').onclick = () => switchTab('general');
  root.querySelector('#specialTab').onclick = () => switchTab('special');

  root.querySelector('#couponRows').addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit]');
    if (edit) return beginEdit(edit.dataset.edit);
    const btn = e.target.closest('[data-users]');
    if (!btn) return;
    try {
      const r = await api(`/api/coupons/${encodeURIComponent(btn.dataset.users)}/collections?limit=100`);
      const box = root.querySelector('#couponUsers');
      box.hidden = false;
      box.innerHTML = `<strong>${esc(btn.dataset.users)} — Collected users (${r.items.length})</strong>
        <div class="table-wrap"><table><thead><tr><th>Customer</th><th>Status</th><th>Collected</th><th>Used</th></tr></thead>
        <tbody>${r.items.map(u =>
          `<tr><td>${esc(u.phone || u.customerPhone || u.customerId)}</td>
            <td>${esc(u.status || 'collected')}</td>
            <td>${u.collectedAt ? new Date(u.collectedAt).toLocaleString() : '—'}</td>
            <td>${u.usedAt ? new Date(u.usedAt).toLocaleString() : '—'}</td>
          </tr>`
        ).join('') || '<tr><td colspan="4">No collection records yet</td></tr>'}</tbody></table></div>`;
    } catch (err) {
      toast(`Could not load users: ${err.message}`);
    }
  });

  await load();
}