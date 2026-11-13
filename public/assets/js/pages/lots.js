import { head, money, esc } from '../helpers.js';

export async function renderLots(root, { api, toast }) {
  const d = await api('/api/lots');
  const lots = d.items || [];

  root.innerHTML = head('Lot Management', 'লট ভিত্তিক কেনা-বেচা এবং লাভ-ক্ষতির হিসাব', 
    `<button class="btn" id="createLotBtn">+ Create New Lot</button>`) + `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Lot No</th>
            <th>Date</th>
            <th>Total Sell</th>
            <th>Stock Cost</th>
            <th>Profit/Loss</th>
            <th>Stock</th>
            <th>Days</th>
            <th>Action</th>
          </tr></thead>
          <tbody>${lots.map(l => {
            const isProfit = l.profit >= 0;
            const profitColor = isProfit ? '#159b72' : '#d64d63';
            const profitSign = isProfit ? '+' : '';
            return `
            <tr>
              <td data-label="Lot No"><strong>${esc(l.lotNo)}</strong></td>
              <td data-label="Date">${new Date(l.createdAt).toLocaleDateString('en-GB')}</td>
              <td data-label="Total Sell">${money(l.totalSell)}</td>
              <td data-label="Stock Cost">${money(l.stockCost || 0)}</td>
              <td data-label="Profit/Loss" style="color: ${profitColor}; font-weight: bold;">
                ${profitSign}${money(l.profit)}
              </td>
              <td data-label="Stock">${l.currentStock} pcs</td>
              <td data-label="Days">${l.daysPassed} days</td>
              <td data-label="Action" class="actions">
                <button class="btn outline small" data-view-lot="${esc(l.id)}">View Details</button>
              </td>
            </tr>
          `}).join('') || '<tr><td colspan="8" class="empty">কোনো লট তৈরি করা হয়নি।</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div id="lotDetails"></div>`;

  // নতুন লট তৈরি
  root.querySelector('#createLotBtn').onclick = async () => {
    const lotNo = prompt('Enter Lot Number (e.g. LOT-001):');
    if (!lotNo) return;
    try {
      await api('/api/lots', { method: 'POST', body: JSON.stringify({ lotNo }) });
      toast('Lot created successfully');
      renderLots(root, { api, toast });
    } catch (e) {
      toast(e.message);
    }
  };

  // লট ডিটেইলস দেখা
  root.querySelectorAll('[data-view-lot]').forEach(b => b.onclick = async () => {
    const lotId = b.dataset.viewLot;
    const details = await api(`/api/lots/${lotId}`);
    const box = root.querySelector('#lotDetails');
    
    let html = `<div class="card" style="margin-top: 20px;"><h3>Lot ${esc(details.lot.lotNo)} - Category Breakdown</h3>`;
    if (Object.keys(details.categories).length === 0) {
      html += '<p class="muted">এই লটে কোনো প্রোডাক্ট নেই।</p>';
    } else {
      html += `<div class="grid two-col">${Object.entries(details.categories).map(([cat, prods]) => `
        <article class="card">
          <h4 style="margin-top:0;">${esc(cat)} (${prods.length} items)</h4>
          <ul>
            ${prods.map(p => `<li>${esc(p.name)} - ${p.totalStock} pcs <span class="muted">(৳${Number(p.stockValue || 0).toLocaleString()})</span></li>`).join('')}
          </ul>
        </article>
      `).join('')}</div>`;
    }
    html += `</div>`;
    box.innerHTML = html;
  });
}
