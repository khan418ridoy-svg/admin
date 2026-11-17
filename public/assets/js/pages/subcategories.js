
'use strict';

import {
  createElement,
  showToast,
  confirmAction
} from '../helpers.js';

import { api } from '../api.js';

// ========================================
// Font Awesome
// ========================================

function loadFontAwesome() {
  if (document.querySelector('link[data-font-awesome]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
  link.dataset.fontAwesome = 'true';

  document.head.appendChild(link);
}

// ========================================
// State
// ========================================

let pageElement = null;
let collectionsData = [];
let allSubcategories = [];
let isSaving = false;

// ========================================
// General Helpers
// ========================================

function getElement(selector) {
  return pageElement?.querySelector(selector) || null;
}

function notify(message, type = 'info') {
  showToast(message, type);
}

function getCategories(collection) {
  return Array.isArray(collection?.categories)
    ? collection.categories
    : [];
}

function getSubcategoryItems(category) {
  const items = category?.subCategories ?? category?.subcategories;
  return Array.isArray(items) ? items : [];
}

function getSelectedCollectionId() {
  return getElement('#subcategory-collection')?.value || '';
}

function getSelectedCategoryId() {
  return getElement('#subcategory-category')?.value || '';
}

function getSelectedCollection() {
  const id = getSelectedCollectionId();

  return collectionsData.find(item => item.id === id) || null;
}

function getSelectedCategory() {
  const collection = getSelectedCollection();
  const categoryId = getSelectedCategoryId();

  return getCategories(collection).find(
    item => item.id === categoryId
  ) || null;
}

function createMessage(className, titleText, descriptionText) {
  const wrapper = createElement('div', { className });

  wrapper.append(
    createElement('h3', { text: titleText }),
    createElement('p', { text: descriptionText })
  );

  return wrapper;
}

function slugify(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function createSubcategoryId(name, categoryId) {
  const slug = slugify(name);

  if (!slug) return '';

  return `${categoryId}-${slug}`.slice(0, 128);
}

// ========================================
// Icon Helpers
// ========================================

function isFontAwesomeIcon(value = '') {
  const classes = String(value).trim().split(/\s+/);

  const validStyles = [
    'fa-solid',
    'fa-regular',
    'fa-brands',
    'fa-light',
    'fa-thin',
    'fa-duotone',
    'fas',
    'far',
    'fab',
    'fal',
    'fat'
  ];

  return (
    classes.length >= 2 &&
    validStyles.includes(classes[0]) &&
    classes.every(className =>
      /^fa-[a-z0-9-]+$/i.test(className) ||
      validStyles.includes(className)
    )
  );
}

function renderIconContent(container, iconValue = '', fallback = '📁') {
  container.replaceChildren();

  const value = String(iconValue || '').trim();

  if (isFontAwesomeIcon(value)) {
    container.appendChild(
      createElement('i', {
        className: value,
        attributes: {
          'aria-hidden': 'true'
        }
      })
    );

    return;
  }

  container.textContent = value || fallback;
}

function createParentChip(iconValue, label, fallback = '📁') {
  const chip = createElement('span', {
    className: 'subcategory-parent-chip'
  });

  const icon = createElement('span', {
    className: 'subcategory-chip-icon',
    attributes: {
      'aria-hidden': 'true'
    }
  });

  renderIconContent(icon, iconValue, fallback);

  const text = createElement('span', {
    className: 'subcategory-chip-text',
    text: label || 'Unknown'
  });

  chip.append(icon, text);

  return chip;
}

// ========================================
// Flatten Taxonomy
// ========================================

function buildSubcategoryList() {
  allSubcategories = [];

  collectionsData.forEach(collection => {
    getCategories(collection).forEach(category => {
      getSubcategoryItems(category).forEach(subcategory => {
        allSubcategories.push({
          ...subcategory,

          _collectionId: collection.id,
          _collectionName: collection.name || collection.id,
          _collectionIcon: collection.icon || '',

          _categoryId: category.id,
          _categoryName: category.name || category.id,
          _categoryIcon: category.icon || ''
        });
      });
    });
  });
}

// ========================================
// Filter Options
// ========================================

function setCollectionOptions(selectedId = '') {
  const select = getElement('#subcategory-collection');

  if (!select) return;

  select.replaceChildren();

  select.appendChild(
    createElement('option', {
      text: 'All Collections',
      attributes: { value: '' }
    })
  );

  collectionsData.forEach(collection => {
    select.appendChild(
      createElement('option', {
        text: collection.name || collection.id,
        attributes: { value: collection.id }
      })
    );
  });

  select.value = collectionsData.some(item => item.id === selectedId)
    ? selectedId
    : '';

  select.disabled = collectionsData.length === 0;
}

function setCategoryOptions(selectedId = '') {
  const select = getElement('#subcategory-category');

  if (!select) return;

  const collectionId = getSelectedCollectionId();

  const collections = collectionId
    ? collectionsData.filter(item => item.id === collectionId)
    : collectionsData;

  const categories = collections.flatMap(collection =>
    getCategories(collection).map(category => ({
      ...category,
      _collectionId: collection.id
    }))
  );

  select.replaceChildren();

  select.appendChild(
    createElement('option', {
      text: 'All Categories',
      attributes: { value: '' }
    })
  );

  categories.forEach(category => {
    const option = createElement('option', {
      text: category.name || category.id,
      attributes: { value: category.id }
    });

    // Category ID may repeat in different collections.
    option.dataset.collectionId = category._collectionId;

    select.appendChild(option);
  });

  const matchingOption = Array.from(select.options).find(option =>
    option.value === selectedId &&
    (
      !collectionId ||
      option.dataset.collectionId === collectionId
    )
  );

  select.value = matchingOption ? selectedId : '';
  select.disabled = categories.length === 0;
}

function updateFilterOptions({
  collectionId = getSelectedCollectionId(),
  categoryId = getSelectedCategoryId()
} = {}) {
  setCollectionOptions(collectionId);
  setCategoryOptions(categoryId);
}

// ========================================
// Filtering
// ========================================

function getFilteredSubcategories() {
  const collectionId = getSelectedCollectionId();
  const categoryId = getSelectedCategoryId();

  const keyword = (
    getElement('#subcategory-search')?.value || ''
  ).trim().toLowerCase();

  return allSubcategories.filter(item => {
    const matchesCollection =
      !collectionId || item._collectionId === collectionId;

    const matchesCategory =
      !categoryId || item._categoryId === categoryId;

    const searchableText = [
      item.name,
      item.id,
      item._collectionName,
      item._categoryName
    ].join(' ').toLowerCase();

    const matchesSearch =
      !keyword || searchableText.includes(keyword);

    return (
      matchesCollection &&
      matchesCategory &&
      matchesSearch
    );
  });
}

// ========================================
// Summary
// ========================================

function renderSummary(items) {
  const total = getElement('#subcategory-total');
  const active = getElement('#subcategory-active');
  const inactive = getElement('#subcategory-inactive');

  if (total) total.textContent = String(items.length);

  if (active) {
    active.textContent = String(
      items.filter(item => item.active !== false).length
    );
  }

  if (inactive) {
    inactive.textContent = String(
      items.filter(item => item.active === false).length
    );
  }
}

// ========================================
// Render Subcategory Card
// ========================================

function renderSubcategoryItem(item) {
  const card = createElement('article', {
    className: 'subcategory-card',
    dataset: {
      subcategoryId: item.id || '',
      collectionId: item._collectionId || '',
      categoryId: item._categoryId || ''
    }
  });

  // Header
  const header = createElement('div', {
    className: 'subcategory-card-header'
  });

  const icon = createElement('div', {
    className: 'subcategory-icon',
    attributes: { 'aria-hidden': 'true' }
  });

  renderIconContent(icon, item.icon, '📁');

  const title = createElement('div', {
    className: 'subcategory-card-title'
  });

  title.append(
    createElement('h3', {
      className: 'subcategory-name',
      text: item.name || 'Unnamed Subcategory'
    }),
    createElement('p', {
      className: 'subcategory-id',
      text: `ID: ${item.id || 'N/A'}`
    })
  );

  const status = createElement('span', {
    className: item.active === false
      ? 'status-badge status-inactive'
      : 'status-badge status-active',
    text: item.active === false ? 'Inactive' : 'Active'
  });

  header.append(icon, title, status);

  // Parent information
  const parentInfo = createElement('div', {
    className: 'subcategory-parent-info'
  });

  const collectionRow = createElement('div', {
    className: 'subcategory-parent-row'
  });

  collectionRow.append(
    createElement('span', {
      className: 'subcategory-parent-label',
      text: 'Collection'
    }),
    createParentChip(
      item._collectionIcon,
      item._collectionName,
      '📁'
    )
  );

  const categoryRow = createElement('div', {
    className: 'subcategory-parent-row'
  });

  categoryRow.append(
    createElement('span', {
      className: 'subcategory-parent-label',
      text: 'Category'
    }),
    createParentChip(
      item._categoryIcon,
      item._categoryName,
      '📂'
    )
  );

  parentInfo.append(collectionRow, categoryRow);

  // Footer actions
  const footer = createElement('div', {
    className: 'subcategory-card-footer'
  });

  const editButton = createElement('button', {
    className: 'subcategory-action-btn edit',
    text: 'Edit',
    attributes: {
      type: 'button',
      'data-action': 'edit',
      'data-id': item.id,
      'data-collection-id': item._collectionId,
      'data-category-id': item._categoryId
    }
  });

  const deleteButton = createElement('button', {
    className: 'subcategory-action-btn delete',
    text: 'Delete',
    attributes: {
      type: 'button',
      'data-action': 'delete',
      'data-id': item.id,
      'data-collection-id': item._collectionId,
      'data-category-id': item._categoryId
    }
  });

  footer.append(editButton, deleteButton);

  card.append(header, parentInfo, footer);

  return card;
}

// ========================================
// Render List
// ========================================

function renderSubcategoryList(items = getFilteredSubcategories()) {
  const list = getElement('#subcategories-list');

  if (!list) return;

  list.replaceChildren();

  renderSummary(items);

  if (!items.length) {
    const hasAnyData = allSubcategories.length > 0;

    list.appendChild(
      createMessage(
        'subcategories-empty',
        hasAnyData
          ? 'No Subcategories Found'
          : 'No Subcategories Yet',
        hasAnyData
          ? 'Try changing the filters or search keyword.'
          : 'Add a subcategory to get started.'
      )
    );

    return;
  }

  const grid = createElement('div', {
    className: 'subcategories-grid'
  });

  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    fragment.appendChild(renderSubcategoryItem(item));
  });

  grid.appendChild(fragment);
  list.appendChild(grid);
}

// ========================================
// Refresh List
// ========================================

function refreshList() {
  renderSubcategoryList(getFilteredSubcategories());
}

// ========================================
// Load Taxonomy
// ========================================

async function loadCollections({ forceRefresh = false } = {}) {
  const list = getElement('#subcategories-list');

  if (!list) return;

  list.replaceChildren(
    createMessage(
      'subcategories-loading',
      'Loading Subcategories...',
      'Please wait while taxonomy data is loading.'
    )
  );

  try {
    const response = await api.taxonomy.load({ forceRefresh });

    if (!pageElement) return;

    if (!Array.isArray(response?.collections)) {
      throw new Error('Invalid collections data received from server.');
    }

    collectionsData = response.collections;

    buildSubcategoryList();

    updateFilterOptions({
      collectionId: '',
      categoryId: ''
    });

    refreshList();

  } catch (error) {
    console.error('[SUBCATEGORIES] Load failed:', error);

    if (!pageElement) return;

    list.replaceChildren(
      createMessage(
        'subcategories-error',
        'Unable to Load Subcategories',
        error.message || 'Please try again.'
      )
    );

    const retryButton = createElement('button', {
      className: 'btn btn-primary',
      text: 'Try Again',
      attributes: { type: 'button' }
    });

    retryButton.addEventListener('click', () => {
      loadCollections({ forceRefresh: true });
    });

    list.appendChild(retryButton);
  }
}

// ========================================
// Modal Helpers
// ========================================

function closeModal() {
  document
    .querySelector('#subcategory-modal-overlay')
    ?.remove();

  isSaving = false;
}

function createFormField(labelText, input, hint = '') {
  const field = createElement('div', {
    className: 'form-group'
  });

  const label = createElement('label', {
    text: labelText
  });

  field.append(label, input);

  if (hint) {
    field.appendChild(
      createElement('small', {
        className: 'form-hint',
        text: hint
      })
    );
  }

  return field;
}

function createSelectOption(text, value) {
  return createElement('option', {
    text,
    attributes: { value }
  });
}

// ========================================
// Modal
// ========================================

function openSubcategoryModal(item = null) {
  const isEdit = Boolean(item);

  closeModal();

const overlay = createElement('div', {
  className: 'modal-overlay active',
  id: 'subcategory-modal-overlay'
});
  const modal = createElement('div', {
    className: 'modal',
    attributes: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'subcategory-modal-title'
    }
  });

  // Header
  const header = createElement('div', {
    className: 'modal-header'
  });

  const headerContent = createElement('div', {
    className: 'modal-header-content'
  });

  headerContent.append(
    createElement('h2', {
      className: 'modal-title',
      id: 'subcategory-modal-title',
      text: isEdit ? 'Edit Subcategory' : 'Add Subcategory'
    }),
    createElement('p', {
      className: 'modal-subtitle',
      text: isEdit
        ? 'Update subcategory information.'
        : 'Create a subcategory under a collection and category.'
    })
  );

  const closeButton = createElement('button', {
    className: 'modal-close',
    text: '×',
    attributes: {
      type: 'button',
      'aria-label': 'Close modal'
    }
  });

  header.append(headerContent, closeButton);

  // Form
  const form = createElement('form', {
    className: 'modal-form',
    attributes: { id: 'subcategory-form' }
  });

  // Collection select
  const collectionSelect = createElement('select', {
    className: 'form-control',
    attributes: {
      name: 'collectionId',
      required: true
    }
  });

  collectionSelect.appendChild(
    createSelectOption('Select Collection', '')
  );

  collectionsData.forEach(collection => {
    collectionSelect.appendChild(
      createSelectOption(
        collection.name || collection.id,
        collection.id
      )
    );
  });

  collectionSelect.value = item?._collectionId || getSelectedCollectionId();

  // Category select
  const categorySelect = createElement('select', {
    className: 'form-control',
    attributes: {
      name: 'categoryId',
      required: true
    }
  });

  function populateModalCategories(selectedCategoryId = '') {
    const collection = collectionsData.find(
      entry => entry.id === collectionSelect.value
    );

    categorySelect.replaceChildren();
    categorySelect.appendChild(
      createSelectOption('Select Category', '')
    );

    getCategories(collection).forEach(category => {
      categorySelect.appendChild(
        createSelectOption(
          category.name || category.id,
          category.id
        )
      );
    });

    categorySelect.value = selectedCategoryId;
    categorySelect.disabled = getCategories(collection).length === 0;
  }

  populateModalCategories(item?._categoryId || getSelectedCategoryId());

  if (isEdit) {
    collectionSelect.disabled = true;
    categorySelect.disabled = true;
  }

  collectionSelect.addEventListener('change', () => {
    populateModalCategories('');
  });

  // Name
  const nameInput = createElement('input', {
    className: 'form-control',
    attributes: {
      type: 'text',
      name: 'name',
      placeholder: 'Enter subcategory name',
      maxlength: 100,
      required: true,
      autocomplete: 'off'
    }
  });

  nameInput.value = item?.name || '';

  // ID
  const idInput = createElement('input', {
    className: 'form-control',
    attributes: {
      type: 'text',
      name: 'id',
      placeholder: 'Automatically generated ID',
      maxlength: 128,
      required: true,
      readonly: true
    }
  });

  idInput.value = item?.id || '';

  // Icon
  const iconInput = createElement('input', {
    className: 'form-control',
    attributes: {
      type: 'text',
      name: 'icon',
      placeholder: 'Example: 👕 or fa-solid fa-shirt',
      maxlength: 200,
      autocomplete: 'off'
    }
  });

  iconInput.value = item?.icon || '';

  // Icon preview
  const previewGroup = createElement('div', {
    className: 'form-group subcategory-icon-preview-group'
  });

  const preview = createElement('div', {
    className: 'subcategory-icon subcategory-icon-preview',
    attributes: { 'aria-label': 'Subcategory icon preview' }
  });

  const previewHelp = createElement('small', {
    className: 'form-hint',
    text: 'Emoji অথবা Font Awesome class ব্যবহার করতে পারবেন।'
  });

  renderIconContent(preview, item?.icon || '', '📁');

  previewGroup.append(
    createElement('label', { text: 'Icon Preview' }),
    preview,
    previewHelp
  );

  iconInput.addEventListener('input', () => {
    renderIconContent(preview, iconInput.value, '📁');
  });

  // Active
  const activeInput = createElement('input', {
    attributes: {
      type: 'checkbox',
      name: 'active'
    }
  });

  activeInput.checked = item
    ? item.active !== false
    : true;

  const activeLabel = createElement('label', {
    className: 'checkbox-label'
  });

  activeLabel.append(
    activeInput,
    createElement('span', { text: 'Active Subcategory' })
  );

  const activeGroup = createElement('div', {
    className: 'form-group'
  });

  activeGroup.appendChild(activeLabel);

  // Auto ID
  if (!isEdit) {
    nameInput.addEventListener('input', () => {
      idInput.value = createSubcategoryId(
        nameInput.value,
        categorySelect.value || 'subcategory'
      );
    });

    categorySelect.addEventListener('change', () => {
      idInput.value = createSubcategoryId(
        nameInput.value,
        categorySelect.value || 'subcategory'
      );
    });
  }

  // Actions
  const actions = createElement('div', {
    className: 'modal-actions'
  });

  const cancelButton = createElement('button', {
    className: 'btn btn-secondary',
    text: 'Cancel',
    attributes: { type: 'button' }
  });

  const saveButton = createElement('button', {
    className: 'btn btn-primary',
    text: isEdit ? 'Update Subcategory' : 'Create Subcategory',
    attributes: { type: 'submit' }
  });

  actions.append(cancelButton, saveButton);

  form.append(
    createFormField('Collection', collectionSelect),
    createFormField('Category', categorySelect),
    createFormField('Subcategory Name', nameInput),
    createFormField('Subcategory ID', idInput, 'ID automatically generated from category and name.'),
    createFormField('Icon (Optional)', iconInput),
    previewGroup,
    activeGroup,
    actions
  );

  modal.append(header, form);
  overlay.appendChild(modal);

  // Events
  closeButton.addEventListener('click', closeModal);
  cancelButton.addEventListener('click', closeModal);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeModal();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (isSaving) return;

    const collectionId = collectionSelect.value;
    const categoryId = categorySelect.value;
    const name = nameInput.value.trim();
    const id = idInput.value.trim();
    const icon = iconInput.value.trim();

    const collection = collectionsData.find(
      entry => entry.id === collectionId
    );

    const category = getCategories(collection).find(
      entry => entry.id === categoryId
    );

    if (!collection || !category) {
      notify('Please select a valid Collection and Category.', 'warning');
      return;
    }

    if (!name || !id) {
      notify('Subcategory name and ID are required.', 'warning');
      return;
    }

    if (name.length > 100 || id.length > 128) {
      notify('Name or ID is too long.', 'warning');
      return;
    }

    const payload = {
      name,
      id,
      icon,
      active: activeInput.checked
    };

    isSaving = true;
    saveButton.disabled = true;
    cancelButton.disabled = true;
    closeButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
      if (isEdit) {
        await api.taxonomy.updateSubcategory(
          item._collectionId,
          item._categoryId,
          item.id,
          {
            name: payload.name,
            icon: payload.icon,
            active: payload.active
          }
        );
      } else {
        await api.taxonomy.createSubcategory(
          collectionId,
          categoryId,
          payload
        );
      }

      closeModal();

      await loadCollections({ forceRefresh: true });

      // Keep the parent filters selected after saving.
      const collectionFilter = getElement('#subcategory-collection');
      const categoryFilter = getElement('#subcategory-category');

      if (collectionFilter) collectionFilter.value = collectionId;

      setCategoryOptions(categoryId);

      if (categoryFilter) categoryFilter.value = categoryId;

      refreshList();

      notify(
        isEdit
          ? 'Subcategory updated successfully.'
          : 'Subcategory created successfully.',
        'success'
      );

    } catch (error) {
      console.error('[SUBCATEGORIES] Save failed:', error);

      notify(
        error.message || 'Unable to save subcategory.',
        'error'
      );

      isSaving = false;
      saveButton.disabled = false;
      cancelButton.disabled = false;
      closeButton.disabled = false;
      saveButton.textContent = isEdit
        ? 'Update Subcategory'
        : 'Create Subcategory';
    }
  });

document.body.appendChild(overlay);

nameInput.focus();
}

// ========================================
// Edit
// ========================================

function editSubcategory(id, collectionId, categoryId) {
  const item = allSubcategories.find(entry =>
    entry.id === id &&
    entry._collectionId === collectionId &&
    entry._categoryId === categoryId
  );

  if (!item) {
    notify('Subcategory not found.', 'error');
    return;
  }

  openSubcategoryModal(item);
}

// ========================================
// Delete
// ========================================

async function deleteSubcategory(id, collectionId, categoryId) {
  const item = allSubcategories.find(entry =>
    entry.id === id &&
    entry._collectionId === collectionId &&
    entry._categoryId === categoryId
  );

  if (!item) {
    notify('Subcategory not found.', 'error');
    return;
  }

  const confirmed = await confirmAction(
    `Are you sure you want to delete "${item.name}"?`
  );

  if (!confirmed) return;

  try {
    await api.taxonomy.deleteSubcategory(
      collectionId,
      categoryId,
      id
    );

    await loadCollections({ forceRefresh: true });

    notify('Subcategory deleted successfully.', 'success');

  } catch (error) {
    console.error('[SUBCATEGORIES] Delete failed:', error);

    notify(
      error.message || 'Unable to delete subcategory.',
      'error'
    );
  }
}

// ========================================
// Render Page
// ========================================

export async function render() {
  loadFontAwesome();

  pageElement = null;
  collectionsData = [];
  allSubcategories = [];
  isSaving = false;

  const container = createElement('section', {
    className: 'page subcategories-page',
    id: 'subcategories-page'
  });

  // Header
  const header = createElement('div', {
    className: 'page-header'
  });

  const heading = createElement('div', {
    className: 'page-heading'
  });

  heading.append(
    createElement('h1', { text: 'Subcategories' }),
    createElement('p', {
      text: 'Manage all product subcategories.'
    })
  );

  const addButton = createElement('button', {
    className: 'btn btn-primary',
    text: 'Add Subcategory',
    attributes: {
      type: 'button',
      id: 'add-subcategory-btn'
    }
  });

  header.append(heading, addButton);

  // Summary
  const summary = createElement('div', {
    className: 'subcategories-summary'
  });

  const summaryItems = [
    ['Total Subcategories', 'subcategory-total', 'fa-solid fa-layer-group'],
    ['Active', 'subcategory-active', 'fa-solid fa-circle-check'],
    ['Inactive', 'subcategory-inactive', 'fa-solid fa-circle-xmark']
  ];

  summaryItems.forEach(([label, id, iconClass]) => {
    const card = createElement('div', {
      className: 'subcategory-summary-card'
    });

    const icon = createElement('div', {
      className: 'subcategory-summary-icon'
    });

    icon.appendChild(
      createElement('i', {
        className: iconClass,
        attributes: { 'aria-hidden': 'true' }
      })
    );

    const content = createElement('div', {
      className: 'subcategory-summary-content'
    });

    content.append(
      createElement('span', {
        className: 'subcategory-summary-label',
        text: label
      }),
      createElement('strong', {
        className: 'subcategory-summary-value',
        id,
        text: '0'
      })
    );

    card.append(icon, content);
    summary.appendChild(card);
  });

  // Filters
  const filters = createElement('div', {
    className: 'subcategories-filters'
  });

  const collectionSelect = createElement('select', {
    className: 'form-control subcategory-collection-select',
    attributes: { id: 'subcategory-collection' }
  });

  const categorySelect = createElement('select', {
    className: 'form-control subcategory-category-select',
    attributes: {
      id: 'subcategory-category',
      disabled: true
    }
  });

  const searchInput = createElement('input', {
    className: 'form-control subcategory-search',
    attributes: {
      id: 'subcategory-search',
      type: 'search',
      placeholder: 'Search subcategory, collection or category...',
      autocomplete: 'off'
    }
  });

  const collectionField = createElement('div', {
    className: 'subcategory-filter-field'
  });

  collectionField.append(
    createElement('label', {
      text: 'Collection',
      attributes: { for: 'subcategory-collection' }
    }),
    collectionSelect
  );

  const categoryField = createElement('div', {
    className: 'subcategory-filter-field'
  });

  categoryField.append(
    createElement('label', {
      text: 'Category',
      attributes: { for: 'subcategory-category' }
    }),
    categorySelect
  );

  const searchField = createElement('div', {
    className: 'subcategory-filter-field subcategory-search-field'
  });

  searchField.append(
    createElement('label', {
      text: 'Search',
      attributes: { for: 'subcategory-search' }
    }),
    searchInput
  );

  filters.append(collectionField, categoryField, searchField);

  // List
  const list = createElement('div', {
    id: 'subcategories-list'
  });

  container.append(header, summary, filters, list);

  pageElement = container;

  await loadCollections();

  return container;
}

// ========================================
// Bind Events
// ========================================

export function bindEvents() {
  if (!pageElement) return;

  const collectionSelect = getElement('#subcategory-collection');
  const categorySelect = getElement('#subcategory-category');
  const searchInput = getElement('#subcategory-search');
  const addButton = getElement('#add-subcategory-btn');
  const list = getElement('#subcategories-list');

  collectionSelect?.addEventListener('change', () => {
    setCategoryOptions('');
    refreshList();
  });

  categorySelect?.addEventListener('change', refreshList);

  searchInput?.addEventListener('input', refreshList);

 addButton?.addEventListener('click', () => {
  if (!collectionsData.length) {
    notify('Please create a Collection first.', 'warning');
    return;
  }

  openSubcategoryModal();
});

  list?.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');

    if (!button || !list.contains(button)) return;

    const { action, id, collectionId, categoryId } = button.dataset;

    if (action === 'edit') {
      editSubcategory(id, collectionId, categoryId);
    }

    if (action === 'delete') {
      deleteSubcategory(id, collectionId, categoryId);
    }
  });
}

// ========================================
// Public Getters
// ========================================

export function getCollections() {
  return [...collectionsData];
}

export function getSubcategories() {
  return [...allSubcategories];
}

// ========================================
// Cleanup
// ========================================

export function cleanup() {
  closeModal();

  pageElement = null;
  collectionsData = [];
  allSubcategories = [];
  isSaving = false;
}
