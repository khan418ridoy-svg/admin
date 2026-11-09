import { head, money, esc } from '../helpers.js';

export async function renderPos(root, { api, toast }) {
  let cart = [];
  let searchTimeout;

  root.innerHTML = head('Point of Sale (POS)', 'দোকানে সরাসরি বিক্রির জন্য দ্রুত ক্যাশ কাউন্টার') + `
    <div class="grid two-col" style="align-items: start;">
      <!-- বাম দিক: প্রোডাক্ট সার্চ -->
      <div class="card">
        <div class="field" style="margin-bottom: 15px;">
          <input type="text" id="posSearch" placeholder="Search by Name, SKU or Product Code..." style="font-size: 18px; padding: 15px;">
        </div>
        <div id="posSearchResults" class="pos-products-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;">
          <div class="empty">প্রোডাক্ট সার্চ করুন...</div>
        </div>
      </div>

      <!-- ডান দিক: কার্ট -->
      <div class="card" style="position: sticky; top: 20px;">
        <h3 class="section-title">Current Cart</h3>
        <div id="posCartList" style="margin-bottom: 15px; max-height: 400px; overflow-y: auto;">
          <div class="empty">কার্ট খালি</div>
        </div>
        
        <div style="border-top: 1px solid #eee; padding-top: 15px; margin-bottom: 15px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>Subtotal:</span> <strong id="posSubtotal">৳0</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 20px; font-weight: bold;">
            <span>Total:</span> <span id="posTotal">৳0</span>
          </div>
        </div>

        <div class="field">
          <label>Customer Name</label>
          <input type="text" id="posCustomerName" placeholder="Walk-in Customer" value="Walk-in Customer">
        </div>
        <div class="field">
          <label>Phone (Optional)</label>
          <input type="text" id="posCustomerPhone" placeholder="01XXXXXXXXX" value="01700000000">
        </div>
        <div class="field">
          <label>Payment Method</label>
          <select id="posPaymentMethod">
            <option value="cash">Cash</option>
            <option value="bkash">bKash</option>
            <option value="card">Card</option>
          </select>
        </div>

        <button class="btn" id="posCheckoutBtn" style="width: 100%; padding: 15px; font-size: 16px; background: #159b72;" disabled>Complete Sale</button>
      </div>
    </div>
  `;

  const searchInput = root.querySelector('#posSearch');
  const searchResults = root.querySelector('#posSearchResults');
  const cartList = root.querySelector('#posCartList');
  const subtotalEl = root.querySelector('#posSubtotal');
  const totalEl = root.querySelector('#posTotal');
  const checkoutBtn = root.querySelector('#posCheckoutBtn');

  // সার্চ লজিক
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (!q) {
      searchResults.innerHTML = '<div class="empty">প্রোডাক্ট সার্চ করুন...</div>';
      return;
    }
    searchResults.innerHTML = '<div class="empty">Searching...</div>';
    
    searchTimeout = setTimeout(async () => {
      try {
        const res = await api(`/api/pos/search?q=${encodeURIComponent(q)}`);
        if (!res.items.length) {
          searchResults.innerHTML = '<div class="empty">কোনো প্রোডাক্ট পাওয়া যায়নি</div>';
          return;
        }
        searchResults.innerHTML = res.items.map(p => `
          <div class="card" style="padding: 10px; cursor: pointer; text-align: center; box-shadow: none; border: 1px solid #ddd;" onclick='window.selectPosProduct(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
            ${p.mainImage ? `<img src="${esc(p.mainImage)}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; margin-bottom: 8px;">` : ''}
            <div style="font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${esc(p.name)}</div>
            <div style="color: #159b72; font-weight: bold;">${money(p.sellingPrice)}</div>
            <div style="font-size: 11px; color: #888;">Stock: ${p.totalStock}</div>
          </div>
        `).join('');
      } catch (err) {
        searchResults.innerHTML = `<div class="empty">Error: ${err.message}</div>`;
      }
    }, 400);
  });

  // গ্লোবাল ফাংশন (প্রোডাক্ট সিলেক্ট করার জন্য)
  window.selectPosProduct = (product) => {
    // প্রথমে ভ্যারিয়েন্ট সিলেক্ট করতে হবে (সরলতার জন্য প্রথম ভ্যারিয়েন্ট নিচ্ছি)
    const variantSku = Object.keys(product.variants || {})[0];
    if (!variantSku) return toast('No variants found');
    const v = product.variants[variantSku];
    
    if (v.stock <= 0) return toast('Out of stock');

    const existing = cart.find(c => c.productId === product.id && c.variantSku === variantSku);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({
        productId: product.id,
        variantSku,
        name: product.name,
        color: v.color,
        size: v.size,
        unitPrice: Number(v.sellingPrice || product.sellingPrice),
        qty: 1,
        maxStock: v.stock
      });
    }
    renderCart();
  };

  const renderCart = () => {
    if (!cart.length) {
      cartList.innerHTML = '<div class="empty">কার্ট খালি</div>';
      checkoutBtn.disabled = true;
      subtotalEl.textContent = '৳0';
      totalEl.textContent = '৳0';
      return;
    }

    let total = 0;
    cartList.innerHTML = cart.map((item, i) => {
      total += item.unitPrice * item.qty;
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding: 10px 0;">
          <div>
            <div style="font-weight: bold; font-size: 14px;">${esc(item.name)}</div>
            <div style="font-size: 12px; color: #666;">${item.color} / ${item.size}</div>
            <div style="font-size: 14px; font-weight: bold; color: #159b72;">${money(item.unitPrice)}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn secondary" style="padding: 4px 8px;" onclick="window.updatePosQty(${i}, -1)">-</button>
            <span>${item.qty}</span>
            <button class="btn secondary" style="padding: 4px 8px;" onclick="window.updatePosQty(${i}, 1)">+</button>
          </div>
        </div>
      `;
    }).join('');

    subtotalEl.textContent = money(total);
    totalEl.textContent = money(total);
    checkoutBtn.disabled = false;
  };

  window.updatePosQty = (index, change) => {
    const item = cart[index];
    const newQty = item.qty + change;
    if (newQty <= 0) {
      cart.splice(index, 1);
    } else if (newQty > item.maxStock) {
      toast('স্টকের চেয়ে বেশি যোগ করা যাবে না');
    } else {
      item.qty = newQty;
    }
    renderCart();
  };

  // চেকআউট লজিক
  checkoutBtn.onclick = async () => {
    const name = root.querySelector('#posCustomerName').value.trim();
    const phone = root.querySelector('#posCustomerPhone').value.trim();
    const paymentMethod = root.querySelector('#posPaymentMethod').value;

    if (!name) return toast('Customer Name দিন');
    if (!phone) return toast('Phone Number দিন');

    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Processing...';

    try {
      const res = await api('/api/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map(c => ({ productId: c.productId, variantSku: c.variantSku, color: c.color, size: c.size, qty: c.qty })),
          customer: { name, phone },
          paymentMethod
        })
      });

      toast(`সফলভাবে বিক্রি হয়েছে! Order: ${res.order.orderNo}`);
      cart = [];
      renderCart();
      searchInput.value = '';
      searchResults.innerHTML = '<div class="empty">প্রোডাক্ট সার্চ করুন...</div>';
    } catch (err) {
      toast(`Failed: ${err.message}`);
    } finally {
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = 'Complete Sale';
    }
  };
}
