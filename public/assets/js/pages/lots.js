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
            <th>Lot No</th><th>Date</th><th>Total Buy</th><th>Total Sell</th><th>Profit</th><th>Stock</th><th>Days</th><th>Action</th>
          </tr></thead>
          <tbody>${lots.map(l => `
            <tr>
              <td><strong>${esc(l.lotNo)}</strong></td>
              <td>${new Date(l.createdAt).toLocaleDateString('en-GB')}</td>
              <td>${money(l.totalBuyCost)}</td>
              <td>${money(l.totalSell)}</td>
              <td class="${l.profit >= 0 ? 'text-green' : 'text-red'}" style="color:${l.profit >= 0 ? 'green' : 'red'}">${money(l.profit)}</td>
              <td>${l.currentStock} pcs</td>
              <td>${l.daysPassed} days</td>
              <td><button class="btn outline small" data-view-lot="${esc(l.id)}">View Details</button></td>
            </tr>
          `).join('') || '<tr><td colspan="8" class="empty">কোনো লট তৈরি করা হয়নি।</td></tr>'}</tbody>
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
          <ul>${prods.map(p => `<li>${esc(p.name)} - ${p.totalStock} pcs</li>`).join('')}</ul>
        </article>
      `).join('')}</div>`;
    }
    html += `</div>`;
    box.innerHTML = html;
  });
}