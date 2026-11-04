import { head, esc } from '../helpers.js';



export async function renderSettings(root, { api, toast }) {
  const [sr, br] = await Promise.allSettled([api('/api/settings'), api('/api/bot/config')]);
  const d = sr.status === 'fulfilled' ? sr.value : { settings: {} };
  const b = br.status === 'fulfilled' ? br.value : { config: {} };

  // ডিফল্ট ডেলিভারি ডিসকাউন্ট রুলস (যদি ডাটাবেসে কিছু না থাকে)
  let deliveryRules = d.settings?.deliveryRules || [
    { minAmount: 500, type: 'percent', value: 10, expiry: null },
    { minAmount: 1000, type: 'free', value: 0, expiry: null }
  ];

  const renderRules = () => {
    const container = root.querySelector('#deliveryRulesList');
    if (!deliveryRules.length) {
      container.innerHTML = '<p class="muted">কোনো রুল নেই। নতুন রুল যোগ করুন।</p>';
      return;
    }
    container.innerHTML = deliveryRules.map((rule, index) => `
      <div class="image-row" style="margin-bottom: 8px; background: #fafafa; align-items: flex-start;">
        <div style="display: flex; gap: 10px; flex-wrap: wrap; width: 100%;">
          <div class="field" style="margin: 0; flex: 1; min-width: 120px;">
            <label>Min Order Amount (৳)</label>
            <input type="number" class="rule-amount" value="${rule.minAmount}" min="0">
          </div>
          <div class="field" style="margin: 0; flex: 1; min-width: 120px;">
            <label>Discount Type</label>
            <select class="rule-type">
              <option value="percent" ${rule.type === 'percent' ? 'selected' : ''}>Percent (%)</option>
              <option value="free" ${rule.type === 'free' ? 'selected' : ''}>Free Delivery</option>
            </select>
          </div>
          <div class="field" style="margin: 0; flex: 1; min-width: 120px;">
            <label>Value</label>
            <input type="number" class="rule-value" value="${rule.value}" min="0" ${rule.type === 'free' ? 'disabled' : ''} placeholder="0">
          </div>
          <div class="field" style="margin: 0; flex: 1; min-width: 150px;">
            <label>Expiry Date (Optional)</label>
            <input type="date" class="rule-expiry" value="${rule.expiry ? new Date(rule.expiry).toISOString().split('T')[0] : ''}">
          </div>
          <div style="display: flex; align-items: flex-end; padding-bottom: 4px;">
            <button type="button" class="btn danger" data-remove-rule="${index}">✕</button>
          </div>
        </div>
      </div>
    `).join('');
    
    // Type change করলে Value ফিল্ড ডিজেবল/এনাবল করা
    container.querySelectorAll('.rule-type').forEach(select => {
      select.onchange = (e) => {
        const valueInput = e.target.closest('.image-row').querySelector('.rule-value');
        valueInput.disabled = e.target.value === 'free';
        if (e.target.value === 'free') valueInput.value = 0;
      };
    });
  };

  root.innerHTML = head('Settings', 'Store configuration, delivery rules and Messenger bot controls') + `
    <div class="grid two-col">
      <form class="card" id="storeSettings">
        <h3 class="section-title">Store settings</h3>
        <div class="field"><label>Delivery inside Dhaka (৳)</label><input name="deliveryDhaka" type="number" min="0" value="${d.settings?.deliveryDhaka ?? 80}"></div>
        <div class="field"><label>Delivery outside Dhaka (৳)</label><input name="deliveryOutside" type="number" min="0" value="${d.settings?.deliveryOutside ?? 130}"></div>
        <button class="btn">Save settings</button>
      </form>

      <form class="card" id="paymentDiscountSettings">
        <h3 class="section-title">Payment discount</h3>
        <label><input type="checkbox" name="enabled" ${d.settings?.paymentDiscount?.enabled ? 'checked' : ''}> Enable online payment offer</label>
        <div class="field"><label>Discount (%)</label><input name="percent" type="number" min="0" max="100" value="${d.settings?.paymentDiscount?.percent ?? 2}"></div>
        <div class="field"><label>Minimum Purchase (৳)</label><input name="minPurchase" type="number" min="0" value="${d.settings?.paymentDiscount?.minPurchase ?? 1000}"></div>
        <div class="field"><label>Maximum Discount (৳)</label><input name="maxDiscount" type="number" min="0" value="${d.settings?.paymentDiscount?.maxDiscount ?? 200}"></div>
        <p class="muted">Offer is informational only until a payment gateway success callback is verified server-side.</p>
        <button class="btn">Save payment offer</button>
      </form>

      <form class="card" id="deliveryRulesSettings">
        <h3 class="section-title">Dynamic Delivery Discounts / Rules</h3>
        <p class="muted">এখানে একাধিক রুল দিতে পারেন। অর্ডার Amount এই রুলগুলোর সাথে মিললে ডেলিভারি চার্জ কমে যাবে বা ফ্রি হবে।</p>
        <div id="deliveryRulesList"></div>
        <button type="button" class="btn secondary" id="addRuleBtn" style="margin-top: 10px;">+ Add New Rule</button>
        <div style="margin-top: 15px;">
          <button type="submit" class="btn">Save Delivery Rules</button>
        </div>
      </form>

      <form class="card" id="botSettings">
        <h3 class="section-title">Messenger bot</h3>
        <label><input type="checkbox" name="enabled" ${b.config?.enabled ? 'checked' : ''}> Enable bot</label>
        <div class="field"><label>Not found message</label><textarea name="notFoundMessage">${esc(b.config?.notFoundMessage || '')}</textarea></div>
        <button class="btn">Save bot settings</button>
        <div class="notice">API keys and Meta tokens are Render environment variables.</div>
      </form>
    </div>`;

  const rulesContainer = root.querySelector('#deliveryRulesList');
  renderRules();

  root.querySelector('#addRuleBtn').onclick = () => {
    deliveryRules.push({ minAmount: 0, type: 'percent', value: 10, expiry: null });
    renderRules();
  };

  rulesContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-rule]');
    if (btn) {
      deliveryRules.splice(Number(btn.dataset.removeRule), 1);
      renderRules();
    }
  });

  // Save Store Settings
  root.querySelector('#storeSettings').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ deliveryDhaka: Number(f.get('deliveryDhaka')), deliveryOutside: Number(f.get('deliveryOutside')) })
    });
    toast('Store settings saved');
  };

  // Save Payment Offer
  root.querySelector('#paymentDiscountSettings').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        paymentDiscount: {
          enabled: f.has('enabled'),
          percent: Number(f.get('percent')),
          minPurchase: Number(f.get('minPurchase')),
          maxDiscount: Number(f.get('maxDiscount'))
        }
      })
    });
    toast('Payment offer saved');
  };

  // Save Delivery Rules
  root.querySelector('#deliveryRulesSettings').onsubmit = async e => {
    e.preventDefault();
    const rows = [...root.querySelectorAll('.image-row')];
    const newRules = rows.map(row => {
      const amount = Number(row.querySelector('.rule-amount').value || 0);
      const type = row.querySelector('.rule-type').value;
      const val = Number(row.querySelector('.rule-value').value || 0);
      const expiryStr = row.querySelector('.rule-expiry').value;
      return {
        minAmount: amount,
        type: type,
        value: type === 'free' ? 0 : val,
        expiry: expiryStr ? new Date(expiryStr).getTime() : null
      };
    }).filter(r => r.minAmount >= 0);

    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ deliveryRules: newRules })
    });
    toast('Delivery rules saved successfully');
  };

  root.querySelector('#botSettings').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    await api('/api/bot/config', {
      method: 'PUT',
      body: JSON.stringify({ enabled: f.has('enabled'), notFoundMessage: f.get('notFoundMessage') })
    });
    toast('Bot settings saved');
  };
}