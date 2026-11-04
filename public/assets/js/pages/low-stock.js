import { head } from '../helpers.js';
import { productTable } from './products.js';
import { productEditor } from './product-form.js';

export async function renderLowStock(root, { api, toast }) {
  const d = await api('/api/products?limit=100');
  const items = (d.items || []).filter(p =>
    p.hasLowStock || p.stockStatus === 'low_stock' || p.stockStatus === 'out_of_stock' || Number(p.totalStock || 0) <= 5
  );
  root.innerHTML = head('Low stock', 'যেসব product বা variant-এ stock alert এসেছে')
    + `<div class="card">${productTable(items)}</div>`;
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => productEditor(root, api, toast, b.dataset.edit));
}