import { money, esc } from '../helpers.js';
import { reviewBadge, reviewOf, markReview, friendlyError } from './product-review.js';

const show = v => (v === undefined || v === null || v === '' ? '—' : esc(String(v)));
const item = (label, value) => `<div class="pv-item"><span>${label}</span><strong>${value}</strong></div>`;

function imagesHtml(p) {
  const urls = (Array.isArray(p.images) && p.images.length ? p.images.map(x => x.url) : [p.mainImage, p.hoverImage]).filter(Boolean);
  if (!urls.length) return '<div class="pv-gallery"><div class="pv-main-img pv-no-img">No image</div></div>';
  return `<div class="pv-gallery">
    <img class="pv-main-img" id="pvMainImg" src="${esc(urls[0])}" alt="${esc(p.name || '')}">
    <div class="pv-thumbs">${urls.map((u, i) => `<img data-pv-thumb="${esc(u)}" class="${i === 0 ? 'active' : ''}" src="${esc(u)}" alt="">`).join('')}</div>
  </div>`;
}

function variantsHtml(p) {
  const rows = Object.values(p.variants || {});
  if (!rows.length) return '<p class="muted">কোনো Variant নেই</p>';
  return `<div class="table-wrap"><table class="pv-table"><thead><tr>
    <th>Color</th><th>Size</th><th>Variant SKU</th><th>Barcode</th><th>Regular</th><th>Selling</th><th>Stock</th><th>Active</th>
  </tr></thead><tbody>${rows.map(v => `<tr>
    <td>${show(v.color)}</td><td>${show(v.size)}</td><td>${show(v.variantSku)}</td><td>${show(v.barcode)}</td>
    <td>${money(v.regularPrice || 0)}</td><td>${money(v.sellingPrice || 0)}</td>
    <td>${Number(v.stock || 0)}</td><td>${v.isActive === false ? 'No' : 'Yes'}</td>
  </tr>`).join('')}</tbody></table></div>`;
}
function bodyHtml(p, privateCost = {}) {
  const cats = (p.categoryPaths || [])
    .map(x => [x.collectionName, x.categoryName, x.subCategoryName].filter(Boolean).join(' › ')).filter(Boolean);
  const flags = [p.isNewArrival && 'New Arrival', p.isFeatured && 'Featured', p.isBestSeller && 'Best Seller'].filter(Boolean);
  const imgCount = (p.images || []).filter(x => x && x.url).length;
  const warns = [];
  if (imgCount < 3) warns.push(`Image আছে ${imgCount}টি — Active করতে কমপক্ষে ৩টি লাগবে`);
  if (!Object.keys(p.variants || {}).length) warns.push('কোনো Variant নেই');
  if (!p.barcode) warns.push('Product Barcode দেওয়া হয়নি');

  return `<div class="pv-body">
    ${warns.length ? `<div class="notice pv-warn">${warns.map(esc).join(' · ')}</div>` : ''}
    <div class="pv-top">
      ${imagesHtml(p)}
      <div class="pv-grid">
        ${item('Product name', show(p.name))}
        ${item('SKU', show(p.sku))}
        ${item('Product code', show(p.shortCode))}
        ${item('Barcode', show(p.barcode))}
        ${item('Brand', show(p.brand))}
        ${item('Status', show(p.status))}
        ${item('Lot', show(p.lotId))}
        ${item('Fabric', show(p.fabricType))}
        ${item('Fit', show(p.fit))}
        ${item('Sleeve', show(p.sleeveType))}
        ${item('Flags', flags.length ? esc(flags.join(', ')) : '—')}
        ${item('Category', cats.length ? esc(cats.join(' | ')) : '—')}
      </div>
    </div>
    <section class="pv-section"><h3>Price & stock</h3><div class="pv-grid">


      
      ${item(
  'Buy Price',
  privateCost.buyPrice == null
    ? '—'
    : money(privateCost.buyPrice)
)}
      ${item('Regular price', money(p.regularPrice || p.baseRegularPrice || 0))}
      ${item('Selling price', money(p.minPrice || p.sellingPrice || 0))}
      ${item('Discount', `${Number(p.discountPercent || 0)}%`)}
      ${item('Total stock', Number(p.totalStock || 0))}
      ${item('Stock status', show(p.stockStatus))}
      ${item('Sizes', show((p.availableSizes || []).join(', ')))}
      ${item('Colors', show((p.availableColors || []).join(', ')))}
    </div></section>
    <section class="pv-section"><h3>Variants</h3>${variantsHtml(p)}</section>
    <section class="pv-section"><h3>Content</h3>
      <div class="pv-text"><span>Short description</span>${show(p.shortDescription)}</div>
      <div class="pv-text"><span>Description</span>${show(p.description)}</div>
      <div class="pv-text"><span>Wash care</span>${show(p.washCare)}</div>
      <div class="pv-text"><span>Tags</span>${show((p.tags || []).join(', '))}</div>
      <div class="pv-text"><span>Meta title</span>${show(p.metaTitle)}</div>
      <div class="pv-text"><span>Meta description</span>${show(p.metaDescription)}</div>
    </section>
  </div>`;
}

// products: the currently visible (filtered) list, index: which one to open.
export function openProductView({ root, api, toast, products, index, onReviewChanged, onEdit }) {
  let i = index;

  
  const wrap = document.createElement('div');
  wrap.className = 'stock-modal-backdrop';
  wrap.dataset.viewBackdrop = '';
  root.appendChild(wrap);

  const close = () => { document.removeEventListener('keydown', onKey); wrap.remove(); };
  const go = step => {
    const next = i + step;
    if (next < 0 || next >= products.length) return;
    i = next;
    draw();
  };
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  }

  async function mark(status) {
    const p = products[i];
    const buttons = wrap.querySelectorAll('[data-mark]');
    buttons.forEach(b => { b.disabled = true; });
    try {
      await markReview(api, p, status);
      onReviewChanged(p);
      toast(status === 'ok' ? `✔ "${p.name}" OK mark হয়েছে` : status === 'not_ok' ? `✖ "${p.name}" Not OK mark হয়েছে` : 'Mark মুছে ফেলা হয়েছে');
      draw();
    } catch (e) {
      toast(`Mark save failed: ${friendlyError(e)}`);
      buttons.forEach(b => { b.disabled = false; });
    }
  }

  
async function draw() {
  const p = products[i];
  if (!p) return;

  const currentIndex = i;

  wrap.innerHTML = `
    <section class="stock-modal pv-modal card">
      <div class="pv-head">
        <h2>${esc(p.name || '')}</h2>
        <button type="button" class="btn outline" data-pv-close>✕</button>
      </div>
      <div class="pv-body">Loading product details...</div>
    </section>
  `;

  let privateCost = {};

  try {
    const result = await api(`/api/products/${p.id}`);

    // Next/Prev চাপলে পুরোনো response উপেক্ষা করবে
    if (i !== currentIndex || products[i] !== p) return;

    privateCost = result?.privateCost || {};
  } catch (error) {
    if (i !== currentIndex || products[i] !== p) return;

    toast(`Buy Price load failed: ${error.message}`);
  }

  if (i !== currentIndex || products[i] !== p) return;

  const state = reviewOf(p);

  wrap.innerHTML = `<section class="stock-modal pv-modal card" role="dialog" aria-modal="true" aria-label="Product details">
    <div class="pv-head">
      <div class="pv-head-title">
        <h2>${esc(p.name || '')}</h2>
        <div class="muted">${i + 1} / ${products.length} · ${reviewBadge(p)}</div>
      </div>
      <div class="pv-head-actions">
        <button type="button" class="btn secondary" data-pv-change>✎ Change</button>
        <button type="button" class="btn outline" data-pv-close aria-label="Close">✕</button>
      </div>
    </div>

    ${bodyHtml(p, privateCost)}

    <div class="pv-foot">
      <div class="pv-nav">
        <button type="button" class="btn outline" data-pv-prev ${i === 0 ? 'disabled' : ''}>← Prev</button>
        <button type="button" class="btn outline" data-pv-next ${i === products.length - 1 ? 'disabled' : ''}>Next →</button>
      </div>
      <div class="pv-marks">
        <button type="button" class="btn pv-mark-bad" data-mark="not_ok" ${state === 'not_ok' ? 'disabled' : ''}>✖ Not OK</button>
        <button type="button" class="btn pv-mark-ok" data-mark="ok" ${state === 'ok' ? 'disabled' : ''}>✔ OK mark</button>
      </div>
    </div>
  </section>`;

  wrap.querySelector('[data-pv-close]').addEventListener('click', close);
  wrap.querySelector('[data-pv-prev]').addEventListener('click', () => go(-1));
  wrap.querySelector('[data-pv-next]').addEventListener('click', () => go(1));
  wrap.querySelector('[data-pv-change]').addEventListener('click', () => {
    const id = p.id;
    close();
    onEdit(id);
  });

  wrap.querySelectorAll('[data-mark]').forEach(b =>
    b.addEventListener('click', () => mark(b.dataset.mark))
  );

  wrap.querySelectorAll('[data-pv-thumb]').forEach(t =>
    t.addEventListener('click', () => {
      const main = wrap.querySelector('#pvMainImg');
      if (main) main.src = t.dataset.pvThumb;

      wrap.querySelectorAll('[data-pv-thumb]').forEach(x =>
        x.classList.toggle('active', x === t)
      );
    })
  );
}


  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  draw();
}
