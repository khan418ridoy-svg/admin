
'use strict';

import {
  createElement,
  showToast
} from '../helpers.js';

import { api } from '../api.js';

// ========================================
// Font Awesome Loader
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
// Page State
// ========================================

let pageElement = null;
let collectionsData = [];
let categoriesData = [];
let isSaving = false;

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
      /^fa-[a-z0-9-]+$/.test(className) ||
      validStyles.includes(className)
    )
  );
}

function renderIconContent(container, iconValue = '') {
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

  container.textContent = value || '📁';
}

// ========================================
// General Helpers
// ========================================

function notify(message, type = 'info') {
  if (typeof showToast === 'function') {
    showToast(message, type);
    return;
  }

  window.dispatchEvent(
    new CustomEvent('admin:toast', {
      detail: { message, type }
    })
  );
}

function slugify(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getSubcategories(category) {
  const items = category?.subCategories ?? category?.subcategories;
  return Array.isArray(items) ? items : [];
}

function getCollectionById(collectionId) {
  return collectionsData.find(
    collection => collection.id === collectionId
  ) || null;
}

function getSelectedCollectionId() {
  return pageElement?.querySelector(
    '#category-collection'
  )?.value || '';
}

function getSelectedCollection() {
  const collectionId = getSelectedCollectionId();

  if (!collectionId) return null;

  return getCollectionById(collectionId);
}

function createMessage(className, titleText, descriptionText) {
  const wrapper = createElement('div', { className });

  const title = createElement('h3', {
    text: titleText
  });

  const description = createElement('p', {
    text: descriptionText
  });

  wrapper.append(title, description);

  return wrapper;
}

function getAllCategories() {
  return collectionsData.flatMap(collection => {
    const categories = Array.isArray(collection.categories)
      ? collection.categories
      : [];

    return categories.map(category => ({
      ...category,
      _collectionId: collection.id,
      _collectionName: collection.name || collection.id
    }));
  });
}

// ========================================
// Modal
// ========================================

function closeCategoryModal() {
  pageElement?.querySelector('.modal-overlay.active')?.remove();
  isSaving = false;
}

function openCategoryModal(category = null, sourceCollectionId = '') {
  const isEdit = Boolean(category);

  const currentFilterId = getSelectedCollectionId();

  const initialCollectionId =
    sourceCollectionId ||
    category?._collectionId ||
    currentFilterId ||
    '';

  if (isEdit && !initialCollectionId) {
    notify('Unable to identify the category collection.', 'error');
    return;
  }

  closeCategoryModal();

  const overlay = createElement('div', {
    className: 'modal-overlay active'
  });

  const modal = createElement('div', {
    className: 'modal'
  });

  const header = createElement('div', {
    className: 'modal-header'
  });

  const title = createElement('h3', {
    text: isEdit ? 'Edit Category' : 'Add Category'
  });

  const closeButton = createElement('button', {
    className: 'modal-close',
    text: '×',
    attributes: {
      type: 'button',
      'aria-label': 'Close'
    }
  });

  header.append(title, closeButton);

  const form = createElement('form', {
    className: 'modal-form',
    attributes: {
      id: 'category-form'
    }
  });

  // Collection Selector
  const collectionGroup = createElement('div', {
    className: 'form-group'
  });

  const collectionLabel = createElement('label', {
    text: 'Collection'
  });

  const collectionSelect = createElement('select', {
    className: 'form-control',
    attributes: {
      name: 'collectionId',
      required: 'required'
    }
  });

  collectionSelect.appendChild(
    createElement('option', {
      text: 'Select Collection',
      attributes: { value: '' }
    })
  );

  collectionsData.forEach(collection => {
    collectionSelect.appendChild(
      createElement('option', {
        text: collection.name || collection.id,
        attributes: {
          value: collection.id
        }
      })
    );
  });

  collectionSelect.value = initialCollectionId;

  // Moving an existing category needs a dedicated backend operation.
  if (isEdit) {
    collectionSelect.disabled = true;
  }

  collectionGroup.append(
    collectionLabel,
    collectionSelect
  );

  // Category Name
  const nameGroup = createElement('div', {
    className: 'form-group'
  });

  const nameLabel = createElement('label', {
    text: 'Category Name'
  });

  const nameInput = createElement('input', {
    className: 'form-control',
    attributes: {
      type: 'text',
      name: 'name',
      placeholder: 'Enter category name',
      required: 'required',
      maxlength: '80'
    }
  });

  nameInput.value = category?.name || '';

  nameGroup.append(nameLabel, nameInput);

  // Category ID
  const idGroup = createElement('div', {
    className: 'form-group'
  });

  const idLabel = createElement('label', {
    text: 'Category ID'
  });

  const idAttributes = {
    type: 'text',
    name: 'id',
    placeholder: 'category-id',
    required: 'required',
    maxlength: '80'
  };

  if (isEdit) {
    idAttributes.readonly = 'readonly';
  }

  const idInput = createElement('input', {
    className: 'form-control',
    attributes: idAttributes
  });

  idInput.value = category?.id || '';

  idGroup.append(idLabel, idInput);

  // Icon
  const iconGroup = createElement('div', {
    className: 'form-group'
  });

  const iconLabel = createElement('label', {
    text: 'Icon / Emoji'
  });

  const iconInput = createElement('input', {
    className: 'form-control',
    attributes: {
      type: 'text',
      name: 'icon',
      placeholder: 'Example: 👕 or fa-solid fa-shirt',
      maxlength: '200',
      autocomplete: 'off'
    }
  });

  iconInput.value = category?.icon || '';

  iconGroup.append(iconLabel, iconInput);

  // Icon Preview
  const previewGroup = createElement('div', {
    className: 'form-group collection-icon-preview-group'
  });

  const previewLabel = createElement('label', {
    text: 'Icon Preview'
  });

  const iconPreview = createElement('div', {
    className: 'collection-icon collection-icon-preview',
    attributes: {
      'aria-label': 'Category icon preview'
    }
  });

  const iconHelp = createElement('small', {
    className: 'form-hint',
    text: 'Enter an emoji or Font Awesome class, for example: fa-solid fa-shirt'
  });

  renderIconContent(iconPreview, category?.icon || '');

  previewGroup.append(
    previewLabel,
    iconPreview,
    iconHelp
  );

  iconInput.addEventListener('input', () => {
    renderIconContent(iconPreview, iconInput.value);
  });

  // Active Checkbox
  const activeGroup = createElement('div', {
    className: 'form-group'
  });

  const activeLabel = createElement('label', {
    className: 'checkbox-label'
  });

  const activeInput = createElement('input', {
    attributes: {
      type: 'checkbox',
      name: 'active'
    }
  });

  activeInput.checked = category
    ? category.active !== false
    : true;

  const activeText = createElement('span', {
    text: 'Active'
  });

  activeLabel.append(activeInput, activeText);
  activeGroup.append(activeLabel);

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
    text: isEdit ? 'Update Category' : 'Save Category',
    attributes: { type: 'submit' }
  });

  actions.append(cancelButton, saveButton);

  form.append(
    collectionGroup,
    nameGroup,
    idGroup,
    iconGroup,
    previewGroup,
    activeGroup,
    actions
  );

  modal.append(header, form);
  overlay.append(modal);

  pageElement.append(overlay);

  // Auto-generate ID
  if (!isEdit) {
    nameInput.addEventListener('input', () => {
      idInput.value = slugify(nameInput.value);
    });
  }

  // Close Events
  closeButton.addEventListener('click', closeCategoryModal);
  cancelButton.addEventListener('click', closeCategoryModal);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      closeCategoryModal();
    }
  });

  // Submit
  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (isSaving) return;

    const collectionId = collectionSelect.value;
    const name = nameInput.value.trim();
    const id = idInput.value.trim();
    const icon = iconInput.value.trim();
    const active = activeInput.checked;

    if (!collectionId || !getCollectionById(collectionId)) {
      notify('Please select a valid collection.', 'warning');
      return;
    }

    if (!name || !id) {
      notify('Category name and ID are required.', 'warning');
      return;
    }

    if (name.length > 80 || id.length > 80) {
      notify('Category name and ID cannot exceed 80 characters.', 'warning');
      return;
    }

    const payload = {
      name,
      id,
      icon,
      active
    };

    isSaving = true;
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
      if (isEdit) {
        await api.taxonomy.updateCategory(
          collectionId,
          category.id,
          {
            name,
            icon,
            active
          }
        );
      } else {
        await api.taxonomy.createCategory(
          collectionId,
          payload
        );
      }

      closeCategoryModal();

      await refreshCategories(collectionId);

      notify(
        isEdit
          ? 'Category updated successfully.'
          : 'Category created successfully.',
        'success'
      );

    } catch (error) {
      console.error('[CATEGORIES] Save failed:', error);

      notify(
        error.message || 'Unable to save category.',
        'error'
      );

      isSaving = false;
      saveButton.disabled = false;
      saveButton.textContent = isEdit
        ? 'Update Category'
        : 'Save Category';
    }
  });

  nameInput.focus();
}

// ========================================
// Refresh Categories
// ========================================

async function refreshCategories(selectedCollectionId = '') {
  const response = await api.taxonomy.load({
    forceRefresh: true
  });

  if (!Array.isArray(response.collections)) {
    throw new Error('Unable to refresh collections.');
  }

  collectionsData = response.collections;

  setCollections(collectionsData, selectedCollectionId);
  updateSelectedCollection();
}

// ========================================
// Render Category Card
// ========================================

function renderCategoryItem(category) {
  const item = createElement('article', {
    className: 'category-card',
    attributes: {
      'data-category-id': category.id || '',
      'data-collection-id': category._collectionId || ''
    }
  });

  const header = createElement('div', {
    className: 'category-card-header'
  });

  const icon = createElement('div', {
    className: 'category-icon',
    attributes: {
      'aria-hidden': 'true'
    }
  });

  renderIconContent(icon, category.icon);

  const name = createElement('h3', {
    className: 'category-name',
    text: category.name || category.id || 'Unnamed Category'
  });

  const status = createElement('span', {
    className: category.active !== false
      ? 'status-badge status-active'
      : 'status-badge status-inactive',
    text: category.active !== false ? 'Active' : 'Inactive'
  });

  header.append(icon, name, status);

  const collectionName = createElement('p', {
    className: 'category-collection-name',
    text: `Collection: ${category._collectionName || 'Unknown'}`
  });

  const id = createElement('p', {
    className: 'category-id',
    text: `ID: ${category.id || 'N/A'}`
  });

  const count = createElement('p', {
    className: 'category-subcategory-count',
    text: `Subcategories: ${getSubcategories(category).length}`
  });

  const actions = createElement('div', {
    className: 'category-actions'
  });

  const editButton = createElement('button', {
    className: 'btn btn-secondary',
    text: 'Edit',
    attributes: {
      type: 'button',
      'data-action': 'edit'
    }
  });

  const deleteButton = createElement('button', {
    className: 'btn btn-danger',
    text: 'Delete',
    attributes: {
      type: 'button',
      'data-action': 'delete'
    }
  });

  actions.append(editButton, deleteButton);

  item.append(
    header,
    collectionName,
    id,
    count,
    actions
  );

  return item;
}

// ========================================
// Render Category List
// ========================================

function renderCategoryList(categories) {
  if (!pageElement) return;

  const list = pageElement.querySelector('#categories-list');

  if (!list) return;

  list.replaceChildren();

  if (!categories.length) {
    list.appendChild(
      createMessage(
        'empty-state',
        'No Categories Found',
        'No categories are available for this selection.'
      )
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  categories.forEach(category => {
    fragment.appendChild(renderCategoryItem(category));
  });

  list.appendChild(fragment);
}

// ========================================
// Filter Categories
// ========================================

function filterCategories(searchText = '') {
  const query = searchText.trim().toLowerCase();
  const selectedCollectionId = getSelectedCollectionId();

  const allCategories = getAllCategories();

  const filtered = allCategories.filter(category => {
    const matchesCollection =
      !selectedCollectionId ||
      category._collectionId === selectedCollectionId;

    const name = String(category.name || '').toLowerCase();
    const id = String(category.id || '').toLowerCase();
    const collectionName = String(
      category._collectionName || ''
    ).toLowerCase();

    const matchesSearch =
      !query ||
      name.includes(query) ||
      id.includes(query) ||
      collectionName.includes(query);

    return matchesCollection && matchesSearch;
  });

  categoriesData = filtered;
  renderCategoryList(filtered);
}

// ========================================
// Update Selected Collection
// ========================================

function updateSelectedCollection() {
  if (!pageElement) return;

  const searchInput = pageElement.querySelector('#category-search');

  filterCategories(searchInput?.value || '');

  const collectionId = getSelectedCollectionId();

  window.dispatchEvent(
    new CustomEvent('categories:collection-change', {
      detail: {
        collectionId: collectionId || null,
        categories: [...categoriesData]
      }
    })
  );
}

// ========================================
// Load Collections
// ========================================

async function loadCollections() {
  if (!pageElement) return;

  const select = pageElement.querySelector('#category-collection');
  const list = pageElement.querySelector('#categories-list');

  if (!select || !list) return;

  select.disabled = true;

  list.replaceChildren(
    createMessage(
      'loading-state',
      'Loading Collections...',
      'Please wait.'
    )
  );

  try {
    const response = await api.taxonomy.load();

    if (!pageElement) return;

    if (!Array.isArray(response.collections)) {
      throw new Error('Invalid collections data received from server.');
    }

    collectionsData = response.collections;

    setCollections(collectionsData);
    updateSelectedCollection();

  } catch (error) {
    console.error('[CATEGORIES] Load failed:', error);

    if (!pageElement) return;

    list.replaceChildren(
      createMessage(
        'error-state',
        'Unable to Load Collections',
        error.message || 'Please try again.'
      )
    );

    list.appendChild(
      createElement('button', {
        className: 'btn btn-primary',
        text: 'Try Again',
        attributes: {
          type: 'button',
          id: 'retry-categories-btn'
        }
      })
    );

  } finally {
    if (pageElement && select.isConnected) {
      select.disabled = false;
    }
  }
}

// ========================================
// Set Collections
// ========================================

export function setCollections(
  collections = [],
  selectedCollectionId = null
) {
  if (!pageElement) return;

  const select = pageElement.querySelector('#category-collection');

  if (!select) return;

  const previousValue = selectedCollectionId !== null
    ? selectedCollectionId
    : select.value;

  select.replaceChildren();

  select.appendChild(
    createElement('option', {
      text: 'All Collections',
      attributes: { value: '' }
    })
  );

  collections.forEach(collection => {
    select.appendChild(
      createElement('option', {
        text: collection.name || collection.id,
        attributes: {
          value: collection.id
        }
      })
    );
  });

  const exists = collections.some(
    collection => collection.id === previousValue
  );

  select.value = exists ? previousValue : '';
  select.disabled = false;
}

// ========================================
// Render Page
// ========================================

export async function render() {
  loadFontAwesome();

  const container = createElement('section', {
    className: 'page categories-page',
    attributes: {
      id: 'categories-page'
    }
  });

  const header = createElement('div', {
    className: 'page-header'
  });

  const heading = createElement('div', {
    className: 'page-heading'
  });

  const title = createElement('h2', {
    className: 'page-title',
    text: 'Categories'
  });

  const description = createElement('p', {
    className: 'page-description',
    text: 'Manage categories inside your collections.'
  });

  heading.append(title, description);

  const addButton = createElement('button', {
    className: 'btn btn-primary',
    text: '+ Add Category',
    attributes: {
      type: 'button',
      id: 'add-category-btn'
    }
  });

  header.append(heading, addButton);

  const filters = createElement('div', {
    className: 'categories-filters'
  });

  const collectionSelect = createElement('select', {
    className: 'form-control',
    attributes: {
      id: 'category-collection',
      disabled: 'disabled'
    }
  });

  collectionSelect.appendChild(
    createElement('option', {
      text: 'Loading Collections...',
      attributes: { value: '' }
    })
  );

  const searchInput = createElement('input', {
    className: 'form-control',
    attributes: {
      type: 'search',
      id: 'category-search',
      placeholder: 'Search categories...',
      autocomplete: 'off'
    }
  });

  filters.append(collectionSelect, searchInput);

  const list = createElement('div', {
    className: 'categories-list',
    attributes: {
      id: 'categories-list'
    }
  });

  container.append(header, filters, list);

  pageElement = container;
  collectionsData = [];
  categoriesData = [];

  await loadCollections();

  return container;
}

// ========================================
// Bind Events
// ========================================

export function bindEvents() {
  if (!pageElement) return;

  const addButton = pageElement.querySelector('#add-category-btn');
  const collectionSelect = pageElement.querySelector('#category-collection');
  const searchInput = pageElement.querySelector('#category-search');
  const list = pageElement.querySelector('#categories-list');

  // Add Category
  addButton?.addEventListener('click', () => {
    if (!collectionsData.length) {
      notify('No collections available.', 'warning');
      return;
    }

    openCategoryModal();
  });

  // Collection Filter
  collectionSelect?.addEventListener('change', () => {
    updateSelectedCollection();
  });

  // Search
  searchInput?.addEventListener('input', () => {
    filterCategories(searchInput.value);
  });

  // Edit / Delete / Retry
  list?.addEventListener('click', async event => {
    const button = event.target.closest('button');

    if (!button) return;

    if (button.id === 'retry-categories-btn') {
      await loadCollections();
      return;
    }

    const action = button.dataset.action;

    if (!action) return;

    const card = button.closest('[data-category-id]');

    if (!card) return;

    const categoryId = card.dataset.categoryId;
    const collectionId = card.dataset.collectionId;

    const collection = getCollectionById(collectionId);

    if (!collection) {
      notify('Category collection could not be found.', 'error');
      return;
    }

    const category = (collection.categories || []).find(
      item => item.id === categoryId
    );

    if (!category) {
      notify('Category could not be found.', 'error');
      return;
    }

    const categoryWithCollection = {
      ...category,
      _collectionId: collection.id,
      _collectionName: collection.name || collection.id
    };

    if (action === 'edit') {
      openCategoryModal(
        categoryWithCollection,
        collection.id
      );
      return;
    }

    if (action === 'delete') {
      const confirmed = window.confirm(
        `Delete "${category.name}" category from "${collection.name || collection.id}"? This action cannot be undone.`
      );

      if (!confirmed) return;

      button.disabled = true;

      try {
        await api.taxonomy.deleteCategory(
          collection.id,
          category.id
        );

        await refreshCategories(getSelectedCollectionId());

        notify('Category deleted successfully.', 'success');

      } catch (error) {
        console.error('[CATEGORIES] Delete failed:', error);

        notify(
          error.message || 'Unable to delete category.',
          'error'
        );

        button.disabled = false;
      }
    }
  });
}

// ========================================
// Getters
// ========================================

export function getCategories() {
  return [...categoriesData];
}

export function getLoadedCollections() {
  return [...collectionsData];
}

// ========================================
// Cleanup
// ========================================

export function cleanup() {
  closeCategoryModal();

  pageElement = null;
  collectionsData = [];
  categoriesData = [];
  isSaving = false;
}
