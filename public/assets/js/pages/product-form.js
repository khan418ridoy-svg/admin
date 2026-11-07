import { head, money, esc } from '../helpers.js';
import { renderPage } from './index.js';

export async function productEditor(root, api, toast, id) {
  let item = {}, privateCost = {}, aiLastGeneratedAt = null;
  if (id) {
    const d = await api(`/api/products/${id}`);
    item = d.item || {};
    privateCost = d.privateCost || {};
    aiLastGeneratedAt = item.ai?.lastGeneratedAt || null;
  }
  const content = root.querySelector('#pageContent') || root;
  const tx = await api('/api/categories');
  const collections = (tx.collections || []).filter(c => c.active !== false);
  
  // ১. লট লিস্ট নিয়ে আসা
  const lotsData = await api('/api/lots');
  const lots = lotsData.items || [];

  const paths = Array.isArray(item.categoryPaths) && item.categoryPaths.length
    ? item.categoryPaths
    : (item.collectionId ? [{ collectionId: item.collectionId, categoryId: item.categoryId, subCategoryId: item.subCategoryId || null }] : []);
  let variants = Object.entries(item.variants || {}).map(([variantSku, v]) => ({ variantSku, ...v }));
  let images = Array.isArray(item.images) ? item.images.slice() : [];
  let selectedImageFiles = [];

  const selectedPath = p => paths.some(x =>
    x.collectionId === p.collectionId && x.categoryId === p.categoryId && (x.subCategoryId || '') === (p.subCategoryId || '')
  );

  const taxonomyHtml = collections.map(c =>
    `<div class="tax-pick"><strong>${esc(c.name)}</strong>
      ${(c.categories || []).filter(k => k.active !== false).map(k =>
        `<div class="tax-pick-cat">
          <label><input type="checkbox" data-path="${esc(JSON.stringify({ collectionId: c.id, categoryId: k.id, subCategoryId: null, collectionName: c.name, categoryName: k.name, subCategoryName: '' }))}" ${selectedPath({ collectionId: c.id, categoryId: k.id, subCategoryId: null }) ? 'checked' : ''}> ${esc(k.name)}</label>
          ${(k.subCategories || []).filter(z => z.active !== false).map(z => {
            const path = { collectionId: c.id, categoryId: k.id, subCategoryId: z.id, collectionName: c.name, categoryName: k.name, subCategoryName: z.name };
            return `<label class="tax-sub"><input type="checkbox" data-path="${esc(JSON.stringify(path))}" ${selectedPath(path) ? 'checked' : ''}> ${esc(z.name)}</label>`;
          }).join('')}
        </div>`
      ).join('')}
    </div>`
  ).join('') || '<p class="muted">Category নেই। আগে Category Management থেকে যোগ করুন।</p>';

  const field = (label, name, value = '', type = 'text', extra = '') =>
    `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value ?? '')}" ${extra}></div>`;

  const variantRows = () => variants.map((v, i) =>
    `<tr data-vrow="${i}">
      <td><input type="hidden" data-v="variantSku" value="${esc(v.variantSku || '')}"><input data-v="color" value="${esc(v.color || '')}" placeholder="Black" ${v.variantSku ? 'readonly' : ''}></td>
      <td><input data-v="size" value="${esc(v.size || '')}" placeholder="M" ${v.variantSku ? 'readonly' : ''}></td>
      <td><input data-v="regularPrice" type="number" min="0" value="${Number(v.regularPrice || 0)}"></td>
      <td><input data-v="sellingPrice" type="number" min="0" value="${Number(v.sellingPrice || 0)}"></td>
      <td><input data-v="stock" type="number" min="0" value="${Number(v.stock || 0)}"></td>
      <td><input data-v="lowStockAlert" type="number" min="0" value="${Number(v.lowStockAlert ?? 5)}"></td>
      <td><label class="inline-check"><input data-v="isActive" type="checkbox" ${v.isActive !== false ? 'checked' : ''}> Active</label></td>
      <td><button type="button" class="btn danger small" data-remove-v="${i}" ${v.variantSku ? 'disabled title="Existing variant is retained; deactivate it instead"' : ''}>Remove</button></td>
    </tr>`
  ).join('');

  const imageRows = () => images.map((im, i) =>
    `<div class="image-row" data-img="${i}">
      <img src="${esc(im.url || '')}" alt="">
      <div><strong>${esc(im.alt || `Image ${i + 1}`)}</strong><small>${esc(im.color || 'Any color')} · ${esc(im.publicId || '')}</small></div>
      <button type="button" class="btn danger small" data-remove-img="${i}">Remove</button>
    </div>`
  ).join('');

  content.innerHTML = head(id ? 'Edit product' : 'Add product',
    'সম্পূর্ণ Product form · Variants · Images · Private cost · Gemini AI',
    `<button class="btn outline" id="back">← Back</button>`) + `
  <form class="card product-form" id="productForm">
    <!-- ১. Basic -->
    <section class="form-section"><h3>১. Basic information</h3>
      <div class="form-grid">
        ${field('Product name *', 'name', item.name, 'text', 'required maxlength="80"')}
        ${field('Product SKU *', 'sku', item.sku, 'text', 'required')}
        ${field('Product code (auto generated)', 'shortCode', item.shortCode, 'text', 'readonly placeholder="First save-এর পর তৈরি হবে"')}
        ${field('Brand *', 'brand', item.brand || 'Nishat Fashion', 'text', 'required')}
        
        <!-- লট সিলেক্ট ড্রপডাউন -->
        <div class="field"><label>Assign to Lot (Optional)</label>
          <select name="lotId">
            <option value="">General Stock (No Lot)</option>
            ${lots.map(l => `<option value="${esc(l.id)}" ${item.lotId === l.id ? 'selected' : ''}>${esc(l.lotNo)}</option>`).join('')}
          </select>
        </div>

        <div class="field"><label>Status *</label><select name="status">
          <option value="draft" ${item.status === 'draft' || !item.status ? 'selected' : ''}>Draft</option>
          <option value="active" ${item.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${item.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select></div>
        <div class="field"><label>Extra notes for Gemini</label><input name="aiNotes" value="${esc(item.aiNotes || '')}" placeholder="Eid collection, pre-washed cotton"></div>
      </div>
    </section>

    <!-- ২. Category -->
    <section class="form-section"><h3>২. Category (একাধিক নির্বাচন করা যাবে)</h3>
      <div class="taxonomy-picker">${taxonomyHtml}</div>
      <p class="muted">প্রথম নির্বাচিত category primary হিসেবে ব্যবহৃত হবে।</p>
    </section>

    <!-- ৩. Attributes -->
    <section class="form-section"><h3>৩. Product attributes</h3>
      <div class="form-grid">
        <div class="field"><label>Fabric type *</label><select name="fabricType" required>
          ${['', 'Cotton', 'Polyester', 'Denim', 'Linen', 'Silk', 'Georgette', 'Blend', 'Other'].map(x => `<option ${item.fabricType === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}
        </select></div>
        <div class="field"><label>Fit</label><select name="fit">
          <option value="">Select</option>
          ${['Regular', 'Slim', 'Oversized', 'Relaxed'].map(x => `<option ${item.fit === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select></div>
        <div class="field"><label>Sleeve type</label><select name="sleeveType">
          <option value="">Select</option>
          ${['Full Sleeve', 'Half Sleeve', 'Sleeveless'].map(x => `<option ${item.sleeveType === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select></div>
      </div>
      <div class="toolbar flag-row">
        <label><input name="isNewArrival" type="checkbox" ${item.isNewArrival ? 'checked' : ''}> New Arrival</label>
        <label><input name="isFeatured" type="checkbox" ${item.isFeatured ? 'checked' : ''}> Featured</label>
        <label><input name="isBestSeller" type="checkbox" ${item.isBestSeller ? 'checked' : ''}> Best Seller</label>
      </div>
    </section>

    <!-- ৪. AI content -->
    <section class="form-section">
      <div class="section-toolbar"><h3>৪. Product content (Gemini AI)</h3>
        <div class="toolbar">
          <select id="aiLanguage"><option value="English">English</option><option value="Bangla">বাংলা</option></select>
          <label><input id="aiOverwrite" type="checkbox"> Overwrite existing fields</label>
          <button type="button" class="btn" id="generateAI">✦ Generate all 6 fields</button>
        </div>
      </div>
      <div class="form-grid ai-fields">
        ${field('Short description (max 160)', 'shortDescription', item.shortDescription)}
        <div class="field"><label>Description</label><textarea name="description">${esc(item.description || '')}</textarea></div>
        <div class="field"><label>Wash care</label><textarea name="washCare">${esc(item.washCare || '')}</textarea></div>
        ${field('Tags (AI generated; comma separated)', 'tags', (item.tags || []).join(', '))}
        ${field('Meta title (max 60)', 'metaTitle', item.metaTitle)}
        ${field('Meta description (max 160)', 'metaDescription', item.metaDescription)}
      </div>
      <div id="aiStatus" class="muted" aria-live="polite"></div>
    </section>

    <!-- ৫. Default price -->
    <section class="form-section"><h3>৫. Product default price</h3>
      <p class="notice">যে Variant-এর আলাদা price দেওয়া হবে না, সেটি এই default price ব্যবহার করবে।</p>
      <div class="form-grid">
        ${field('Default regular price (৳)', 'baseRegularPrice', item.baseRegularPrice ?? item.regularPrice ?? '', 'number', 'min="0" step="0.01"')}
        ${field('Default discount / selling price (৳)', 'baseSellingPrice', item.baseSellingPrice ?? item.sellingPrice ?? '', 'number', 'min="0" step="0.01"')}
      </div>
    </section>

    <!-- ৬. Variants -->
    <section class="form-section"><h3>৬. Variants — Color × Size</h3>
      <p class="notice">প্রতিটি Color × Size একটি Variant। Save changes চাপলে নতুন Stock Firestore-এ সেভ হবে।</p>
      <div class="table-wrap"><table class="variant-table"><thead><tr>
        <th>Color</th><th>Size</th><th>Regular ৳</th><th>Selling ৳</th><th>Stock</th><th>Alert</th><th>Active</th><th></th>
      </tr></thead><tbody id="variantRows">${variantRows()}</tbody></table></div>
      <button type="button" class="btn secondary" id="addVariant">+ Add variant</button>
    </section>

    <!-- ৭. Images -->
    <section class="form-section"><h3>৭. Images — কমপক্ষে ৩টি</h3>
      <div class="toolbar">
        <input type="file" id="imageFiles" accept="image/*" multiple>
        <button type="button" class="btn secondary" id="uploadImages">Upload to Cloudinary</button>
      </div>
      <p class="muted">Signed upload ব্যবহার হবে। API Secret browser-এ যাবে না।</p>
      <div id="selectedImagePreview" class="image-list selected-image-preview"></div>
      <div id="imageList" class="image-list">${imageRows()}</div>
      ${field('Main image URL', 'mainImage', item.mainImage || images[0]?.url || '')}
      ${field('Hover image URL', 'hoverImage', item.hoverImage || images[1]?.url || '')}
    </section>

    <!-- ৮. Private cost -->
    <section class="form-section"><h3>৮. Private purchase cost (Admin only)</h3>
      <div class="form-grid">
        ${field('Buy price (৳) *', 'buyPrice', privateCost.buyPrice, 'number', 'min="0" step="0.01"')}
        ${field('Supplier', 'supplier', privateCost.supplier)}
        ${field('Purchase note', 'purchaseNote', privateCost.purchaseNote)}
      </div>
      <div class="field"><label>Variant-wise buy price (SKU=price, comma separated)</label>
        <input id="variantBuyPrice" value="${esc(Object.entries(privateCost.variantBuyPrice || {}).map(([k, v]) => `${k}=${v}`).join(', '))}" placeholder="NF-SH-0001-BLA-M=920">
      </div>
      <p class="muted">Buy price products collection-এ নয়; productCosts/{productId}-এ সেভ হবে।</p>
      <div id="profitPreview" class="notice"></div>
    </section>

    <!-- ৯. Summary -->
    <section class="form-section"><h3>৯. System-generated summary (read only)</h3>
      <div class="summary-grid">
        <div>Total stock: <strong id="sumStock">${Number(item.totalStock || 0)}</strong></div>
        <div>Min price: <strong id="sumPrice">৳${Number(item.minPrice || item.sellingPrice || 0)}</strong></div>
        <div>Available sizes: <strong id="sumSizes">${esc((item.availableSizes || []).join(', '))}</strong></div>
        <div>Available colors: <strong id="sumColors">${esc((item.availableColors || []).join(', '))}</strong></div>
        <div>Stock status: <strong id="sumStatus">${esc(item.stockStatus || 'out_of_stock')}</strong></div>
        <div>Discount: <strong id="sumDiscount">${Number(item.discountPercent || 0)}%</strong></div>
      </div>
    </section>

    <div class="sticky-save">
      <button type="submit" class="btn" id="saveProduct">${id ? 'Save changes' : 'Create product'}</button>
      <button type="button" class="btn secondary" id="copyCaption">Copy Facebook caption</button>
    </div>
  </form>`;

  const form = content.querySelector('#productForm');
  const aiFields = ['shortDescription', 'description', 'washCare', 'tags', 'metaTitle', 'metaDescription'];

  aiFields.forEach(name => {
    const el = form.elements[name];
    if (el) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn outline small ai-retry';
      retry.textContent = 'Retry';
      retry.dataset.aiRetry = name;
      el.closest('.field').append(retry);
    }
  });

  const requestAi = async (fields) => {
    const status = form.querySelector('#aiStatus');
    const els = fields.map(n => form.elements[n]).filter(Boolean);
    els.forEach(el => { el.disabled = true; });
    status.textContent = `Generating ${fields.join(', ')}…`;
    try {
      const selected = [...form.querySelectorAll('[data-path]:checked')].map(x => JSON.parse(x.dataset.path));
      const result = await api('/api/ai/product-content', {
        method: 'POST',
        body: JSON.stringify({
          product: {
            name: form.elements.name.value,
            brand: form.elements.brand.value,
            categoryPaths: selected,
            fabricType: form.elements.fabricType.value,
            fit: form.elements.fit.value,
            sleeveType: form.elements.sleeveType.value,
            colors: [...new Set(collectVariants().map(v => v.color))],
            extraNotes: form.elements.aiNotes.value
          },
          fields,
          language: form.querySelector('#aiLanguage').value
        })
      });
      Object.entries(result.fields || {}).forEach(([k, v]) => {
        if (k === 'tags') form.elements.tags.value = (v || []).join(', ');
        else if (form.elements[k]) form.elements[k].value = v;
      });
      aiLastGeneratedAt = Date.now();
      status.textContent = `Generated by ${result.model} · key slot ${result.keySlot} · ${Object.keys(result.fields || {}).length}/${fields.length} fields completed.`;
      toast('Gemini content generated');
    } catch (e) {
      status.textContent = `Generation failed: ${e.message}`;
      toast(e.message);
    } finally {
      els.forEach(el => { el.disabled = false; });
    }
  };

  form.querySelectorAll('[data-ai-retry]').forEach(b => b.onclick = () => requestAi([b.dataset.aiRetry]));

  const collectVariants = () => {
    const rows = [...form.querySelectorAll('#variantRows tr')];
    return rows.map(row => {
      const v = {};
      row.querySelectorAll('[data-v]').forEach(el => {
        v[el.dataset.v] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value || 0) : el.value.trim();
      });
      return v;
    }).filter(v => v.color && v.size);
  };

  const drawVariants = () => {
    form.querySelector('#variantRows').innerHTML = variantRows();
    bindVariantButtons();
    updateSummary();
  };

  function bindVariantButtons() {
    form.querySelectorAll('[data-remove-v]').forEach(b => b.onclick = () => {
      variants = collectVariants();
      variants.splice(Number(b.dataset.removeV), 1);
      drawVariants();
    });
  }

  const updateSummary = () => {
    const vs = collectVariants();
    const baseRegular = Number(form.elements.baseRegularPrice.value || 0);
    const baseSelling = Number(form.elements.baseSellingPrice.value || 0);
    const effective = vs.map(v => ({
      regular: Number(v.regularPrice) > 0 ? Number(v.regularPrice) : baseRegular,
      selling: Number(v.sellingPrice) > 0 ? Number(v.sellingPrice) : baseSelling,
      stock: Number(v.stock || 0), size: v.size, color: v.color
    }));
    const stock = effective.reduce((n, v) => n + v.stock, 0);
    const prices = effective.map(v => v.selling).filter(v => v > 0);
    const regular = effective.map(v => v.regular).filter(v => v > 0);
    const sizes = [...new Set(effective.filter(v => v.stock > 0).map(v => v.size))];
    const colors = [...new Set(effective.filter(v => v.stock > 0).map(v => v.color))];
    form.querySelector('#sumStock').textContent = stock;
    form.querySelector('#sumPrice').textContent = '৳' + (prices.length ? Math.min(...prices) : baseSelling);
    form.querySelector('#sumSizes').textContent = sizes.join(', ');
    form.querySelector('#sumColors').textContent = colors.join(', ');
    form.querySelector('#sumStatus').textContent = stock === 0 ? 'out_of_stock' : stock <= 5 ? 'low_stock' : 'in_stock';
    const minRegular = regular.length ? Math.min(...regular) : baseRegular;
    const minSelling = prices.length ? Math.min(...prices) : baseSelling;
    form.querySelector('#sumDiscount').textContent = minRegular > 0 ? Math.max(0, Math.round((minRegular - minSelling) / minRegular * 100)) + '%' : '0%';
    const buy = Number(form.elements.buyPrice.value || 0);
    form.querySelector('#profitPreview').textContent = `Estimated profit per piece: ৳${minSelling - buy}`;
  };

  form.querySelector('#variantRows').addEventListener('input', updateSummary);
  form.querySelector('#variantRows').addEventListener('change', updateSummary);
  form.elements.buyPrice.addEventListener('input', updateSummary);
  form.elements.baseRegularPrice.addEventListener('input', updateSummary);
  form.elements.baseSellingPrice.addEventListener('input', updateSummary);
  bindVariantButtons();

  form.querySelector('#addVariant').onclick = () => {
    variants = collectVariants();
    variants.push({ color: '', size: '', regularPrice: 0, sellingPrice: 0, stock: 0, lowStockAlert: 5, isActive: true });
    drawVariants();
  };

  const renderSelectedPreviews = () => {
    const box = form.querySelector('#selectedImagePreview');
    box.innerHTML = selectedImageFiles.map((file, i) =>
      `<div class="image-row">
        <img src="${URL.createObjectURL(file)}" alt="Selected image ${i + 1}">
        <div><strong>${i === 0 ? 'Main image candidate' : i === 1 ? 'Hover image candidate' : `Gallery image ${i + 1}`}</strong>
          <small>${esc(file.name)} · ${(file.size / 1024 / 1024).toFixed(2)} MB</small>
        </div>
        <button type="button" class="btn danger small" data-remove-selected="${i}">Remove</button>
      </div>`
    ).join('');
  };

  form.querySelector('#imageFiles').addEventListener('change', e => {
    selectedImageFiles = [...e.target.files].slice(0, 12);
    renderSelectedPreviews();
  });

  form.querySelector('#selectedImagePreview').addEventListener('click', e => {
    const b = e.target.closest('[data-remove-selected]');
    if (!b) return;
    selectedImageFiles.splice(Number(b.dataset.removeSelected), 1);
    renderSelectedPreviews();
  });

  form.querySelector('#imageList').addEventListener('click', async e => {
    const b = e.target.closest('[data-remove-img]');
    if (!b) return;
    const im = images[Number(b.dataset.removeImg)];
    if (im?.publicId) {
      if (!confirm('Cloudinary থেকেও এই image delete করবেন?')) return;
      try {
        await api('/api/products/cloudinary-delete', { method: 'POST', body: JSON.stringify({ publicId: im.publicId }) });
      } catch (err) {
        return toast(`Cloudinary delete failed: ${err.message}`);
      }
    }
    images.splice(Number(b.dataset.removeImg), 1);
    form.querySelector('#imageList').innerHTML = imageRows();
    form.elements.mainImage.value = images[0]?.url || '';
    form.elements.hoverImage.value = images[1]?.url || '';
  });

  
  form.querySelector('#uploadImages').onclick = async () => {
    if (!selectedImageFiles.length) return toast('আগে image select করুন');
    const b = form.querySelector('#uploadImages');
    b.disabled = true;
    b.textContent = 'Uploading…';
    let uploaded = 0;
    try {
      for (const file of selectedImageFiles) {
        const tempId = id || `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const sig = await api('/api/products/cloudinary-signature', { method: 'POST', body: JSON.stringify({ productId: tempId }) });
        const fd = new FormData();
        fd.append('file', file);
        fd.append('api_key', sig.apiKey);
        fd.append('timestamp', sig.timestamp);
        fd.append('folder', sig.folder);
        fd.append('signature', sig.signature);
        const r = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: 'POST', body: fd });
        const out = await r.json();
        if (!r.ok) throw new Error(out.error?.message || 'cloudinary_upload_failed');
        images.push({ url: out.secure_url, publicId: out.public_id, alt: form.elements.name.value, color: '', order: images.length + 1, width: out.width, height: out.height });
        uploaded++;
      }
      form.querySelector('#imageList').innerHTML = imageRows();
      form.elements.mainImage.value = images[0]?.url || '';
      form.elements.hoverImage.value = images[1]?.url || '';
      selectedImageFiles = [];
      form.querySelector('#imageFiles').value = '';
      renderSelectedPreviews();
      toast(`${uploaded} image uploaded successfully!`);
    } catch (e) {
      toast(`Image upload failed: ${e.message}`);
    } finally {
      b.disabled = false;
      b.textContent = 'Upload to Cloudinary';
    }
  };


  form.querySelector('#generateAI').onclick = async () => {
    const overwrite = form.querySelector('#aiOverwrite').checked;
    const names = aiFields;
    const fields = overwrite ? names : names.filter(n => !String(form.elements[n]?.value || '').trim());
    if (!fields.length) return toast('সব AI field-এ লেখা আছে। Overwrite টিক দিন।');
    const b = form.querySelector('#generateAI');
    b.disabled = true;
    b.textContent = 'Generating…';
    try {
      await requestAi(fields);
    } finally {
      b.disabled = false;
      b.textContent = '✦ Generate all 6 fields';
    }
  };

  const backButton = content.querySelector('#back');
  if (backButton) backButton.addEventListener('click', () => renderPage('products', root, { api, toast }));

  form.querySelector('#copyCaption').onclick = async () => {
    const caption = `${form.elements.name.value}\n${form.elements.shortDescription.value}\nCode: ${form.elements.shortCode.value || 'Will be assigned after save'}\nAvailable colors: ${[...new Set(collectVariants().filter(v => v.stock > 0).map(v => v.color))].join(', ')}\nঅর্ডার করতে Messenger-এ Product Code লিখুন।`;
    await navigator.clipboard.writeText(caption);
    toast('Facebook caption copied');
  };

  form.onsubmit = async e => {
    e.preventDefault();
    const b = form.querySelector('#saveProduct');
    b.disabled = true;
    b.textContent = 'Saving…';
    try {
      const selected = [...form.querySelectorAll('[data-path]:checked')].map(x => JSON.parse(x.dataset.path));
      if (!selected.length) throw new Error('কমপক্ষে একটি Category নির্বাচন করুন');
      const vs = collectVariants();
      if (!vs.length) throw new Error('কমপক্ষে একটি Variant যোগ করুন');
      const sku = form.elements.sku.value.trim();
      vs.forEach(v => {
        if (!v.variantSku) v.variantSku = `${sku}-${v.color.slice(0, 3).toUpperCase()}-${v.size.toUpperCase()}`.replace(/[^A-Z0-9-]/g, '');
      });
      const buyPrice = Number(form.elements.buyPrice.value || 0);
      const variantBuyPrice = {};
      form.querySelector('#variantBuyPrice').value.split(',').map(x => x.trim()).filter(Boolean).forEach(pair => {
        const ix = pair.lastIndexOf('=');
        if (ix > 0) variantBuyPrice[pair.slice(0, ix).trim()] = Number(pair.slice(ix + 1).trim());
      });
      const f = new FormData(form);
      const data = {
        name: f.get('name'), sku, brand: f.get('brand'), status: f.get('status'), lotId: f.get('lotId') || null,
        shortCode: f.get('shortCode') || undefined, categoryPaths: selected,
        tags: String(f.get('tags') || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean),
        isNewArrival: f.has('isNewArrival'), isFeatured: f.has('isFeatured'), isBestSeller: f.has('isBestSeller'),
        fabricType: f.get('fabricType'), fit: f.get('fit'), sleeveType: f.get('sleeveType'),
        baseRegularPrice: Number(f.get('baseRegularPrice') || 0), baseSellingPrice: Number(f.get('baseSellingPrice') || 0),
        shortDescription: form.elements.shortDescription.value, description: form.elements.description.value,
        washCare: form.elements.washCare.value, metaTitle: form.elements.metaTitle.value, metaDescription: form.elements.metaDescription.value,
        images, mainImage: f.get('mainImage') || images[0]?.url || '', hoverImage: f.get('hoverImage') || images[1]?.url || '',
        variants: Object.fromEntries(vs.map(v => [v.variantSku, v])),
        buyPrice, supplier: f.get('supplier'), purchaseNote: f.get('purchaseNote'), variantBuyPrice,
        ai: { lastGeneratedAt: aiLastGeneratedAt, fields: aiFields }
      };
      if (id) await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      else await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
      toast('Product saved successfully');
      await renderPage('products', root, { api, toast });
    } catch (ex) {
      toast(ex.message);
    } finally {
      b.disabled = false;
      b.textContent = id ? 'Save changes' : 'Create product';
    }
  };

  updateSummary();
}