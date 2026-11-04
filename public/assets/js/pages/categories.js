import { head, esc, slugId } from '../helpers.js';

function categoryTreeMarkup(collections) {
  if (!collections.length) return '<div class="empty">এখনো কোনো Collection নেই। প্রথম Collection যোগ করুন।</div>';
  return `<div class="taxonomy-tree">${collections.map(c =>
    `<section class="taxonomy-collection ${c.active === false ? 'is-disabled' : ''}">
      <div class="taxonomy-row">
        <div><strong>${esc(c.name)}</strong> <code>${esc(c.id)}</code> <span class="badge ${c.active === false ? 'amber' : 'green'}">${c.active === false ? 'Inactive' : 'Active'}</span></div>
        <div class="toolbar compact">
          <button class="btn outline" data-tax="add-category" data-c="${esc(c.id)}">+ Category</button>
          <button class="btn outline" data-tax="rename-collection" data-c="${esc(c.id)}">Rename</button>
          <button class="btn secondary" data-tax="toggle-collection" data-c="${esc(c.id)}">${c.active === false ? 'Enable' : 'Disable'}</button>
          <button class="btn danger" data-tax="delete-collection" data-c="${esc(c.id)}">Delete</button>
        </div>
      </div>
      <div class="taxonomy-children">${(c.categories || []).map(cat =>
        `<div class="taxonomy-category ${cat.active === false ? 'is-disabled' : ''}">
          <div class="taxonomy-row">
            <div><strong>${esc(cat.name)}</strong> <code>${esc(cat.id)}</code> <span class="badge ${cat.active === false ? 'amber' : 'green'}">${cat.active === false ? 'Inactive' : 'Active'}</span></div>
            <div class="toolbar compact">
              <button class="btn outline" data-tax="add-subcategory" data-c="${esc(c.id)}" data-cat="${esc(cat.id)}">+ Subcategory</button>
              <button class="btn outline" data-tax="rename-category" data-c="${esc(c.id)}" data-cat="${esc(cat.id)}">Rename</button>
              <button class="btn secondary" data-tax="toggle-category" data-c="${esc(c.id)}" data-cat="${esc(cat.id)}">${cat.active === false ? 'Enable' : 'Disable'}</button>
              <button class="btn danger" data-tax="delete-category" data-c="${esc(c.id)}" data-cat="${esc(cat.id)}">Delete</button>
            </div>
          </div>
          <div class="taxonomy-subchildren">${(cat.subCategories || []).map(sub =>
            `<div class="taxonomy-subrow ${sub.active === false ? 'is-disabled' : ''}">
              <div>${esc(sub.name)} <code>${esc(sub.id)}</code> <span class="badge ${sub.active === false ? 'amber' : 'green'}">${sub.active === false ? 'Inactive' : 'Active'}</span></div>
              <div class="toolbar compact">
                <button class="btn outline" data-tax="rename-subcategory" data-c="${esc(c.id)}" data-cat="${esc(cat.id)}" data-sub="${esc(sub.id)}">Rename</button>
                <button class="btn secondary" data-tax="toggle-subcategory" data-c="${esc(c.id)}" data-cat="${esc(cat.id)}" data-sub="${esc(sub.id)}">${sub.active === false ? 'Enable' : 'Disable'}</button>
                <button class="btn danger" data-tax="delete-subcategory" data-c="${esc(c.id)}" data-cat="${esc(cat.id)}" data-sub="${esc(sub.id)}">Delete</button>
              </div>
            </div>`
          ).join('') || '<p class="muted taxonomy-empty">No subcategories yet.</p>'}</div>
        </div>`
      ).join('') || '<p class="muted taxonomy-empty">No categories yet.</p>'}</div>
    </section>`
  ).join('')}</div>`;
}

export async function renderCategories(root, { api, toast }) {
  let taxonomy = await api('/api/categories');
  let collections = Array.isArray(taxonomy.collections) ? taxonomy.collections : [];

  const normalize = () => {
    collections = collections.map(c => ({
      ...c,
      id: c.id || slugId(c.name),
      active: c.active !== false,
      categories: (c.categories || []).map(cat => ({
        ...cat,
        id: cat.id || slugId(cat.name),
        active: cat.active !== false,
        subCategories: (cat.subCategories || cat.subcategories || []).map(sub => ({
          ...sub, id: sub.id || slugId(sub.name), active: sub.active !== false
        }))
      }))
    }));
  };
  normalize();

  const draw = () => {
    root.innerHTML = head('Category Management', 'Collection → Category → Subcategory পরিচালনা করুন',
      '<button class="btn" id="addCollection">+ Add Collection</button>')
      + `<div class="card">
        <div class="toolbar">
          <span class="muted">মোট ${collections.length} Collections · ${collections.reduce((n, c) => n + c.categories.length, 0)} Categories · ${collections.reduce((n, c) => n + c.categories.reduce((m, k) => m + k.subCategories.length, 0), 0)} Subcategories</span>
          <span class="spacer"></span>
          <button class="btn secondary" id="reloadTaxonomy">Refresh</button>
        </div>
        <div id="taxonomyTree">${categoryTreeMarkup(collections)}</div>
        <p class="notice">Delete করলে সংশ্লিষ্ট Product-এ category ব্যবহার থাকলে API delete বন্ধ করবে।</p>
      </div>`;
    root.querySelector('#addCollection').onclick = () => addCollection();
    root.querySelector('#reloadTaxonomy').onclick = () => renderCategories(root, { api, toast });
    root.querySelectorAll('[data-tax]').forEach(b => b.onclick = () => handleTaxAction(b.dataset));
  };

  const save = async () => {
    normalize();
    await api('/api/categories', { method: 'PUT', body: JSON.stringify({ collections }) });
    toast('Category tree saved');
    draw();
  };

  const unique = (id, items, exclude) => !items.some(x => x.id === id && x.id !== exclude);

  async function addCollection() {
    const name = prompt('Collection name (e.g. Men, Women, Kids)');
    if (!name?.trim()) return;
    const id = slugId(name);
    if (!id || !unique(id, collections)) return toast('এই Collection ID আগে থেকেই আছে');
    collections.push({ id, name: name.trim(), active: true, categories: [] });
    await save();
  }

  async function handleTaxAction(d) {
    const c = collections.find(x => x.id === d.c);
    if (!c) return;
    const cat = (c.categories || []).find(x => x.id === d.cat);
    const sub = (cat?.subCategories || []).find(x => x.id === d.sub);

    if (d.tax === 'add-category') {
      const name = prompt(`Category name in ${c.name}`);
      if (!name?.trim()) return;
      const id = `${c.id}-${slugId(name)}`;
      if (!unique(id, c.categories || [])) return toast('এই Category আগে থেকেই আছে');
      c.categories.push({ id, name: name.trim(), active: true, subCategories: [] });
      return save();
    }
    if (d.tax === 'add-subcategory') {
      const name = prompt(`Subcategory name in ${cat?.name || 'Category'}`);
      if (!name?.trim()) return;
      const id = `${cat.id}-${slugId(name)}`;
      if (!unique(id, cat.subCategories || [])) return toast('এই Subcategory আগে থেকেই আছে');
      cat.subCategories.push({ id, name: name.trim(), active: true });
      return save();
    }

    const rename = async (item, items, label) => {
      const name = prompt(`${label} name`, item.name);
      if (!name?.trim()) return;
      if (items.some(x => x !== item && x.name.toLowerCase() === name.trim().toLowerCase()))
        return toast('এই নাম আগে থেকেই আছে');
      item.name = name.trim();
      await save();
    };

    if (d.tax === 'rename-collection') return rename(c, collections, 'Collection');
    if (d.tax === 'rename-category') return rename(cat, c.categories, 'Category');
    if (d.tax === 'rename-subcategory') return rename(sub, cat.subCategories, 'Subcategory');
    if (d.tax === 'toggle-collection') { c.active = c.active === false; return save(); }
    if (d.tax === 'toggle-category') { cat.active = cat.active === false; return save(); }
    if (d.tax === 'toggle-subcategory') { sub.active = sub.active === false; return save(); }

    if (d.tax === 'delete-collection' || d.tax === 'delete-category' || d.tax === 'delete-subcategory') {
      const label = d.tax.replace('delete-', '');
      const item = d.tax === 'delete-collection' ? c : d.tax === 'delete-category' ? cat : sub;
      if (!confirm(`Delete ${item.name}? Product-এ ব্যবহৃত থাকলে server delete করতে দেবে না।`)) return;
      try {
        await api('/api/categories/delete-check', {
          method: 'POST',
          body: JSON.stringify({ level: label, collectionId: c.id, categoryId: cat?.id, subCategoryId: sub?.id })
        });
      } catch (e) {
        toast(e.message);
        return;
      }
      if (d.tax === 'delete-collection') collections = collections.filter(x => x.id !== c.id);
      else if (d.tax === 'delete-category') c.categories = c.categories.filter(x => x.id !== cat.id);
      else cat.subCategories = cat.subCategories.filter(x => x.id !== sub.id);
      return save();
    }
  }

  draw();
}