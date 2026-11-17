
'use strict';

import {
  createElement,
  createSlug,
  showToast,
  confirmAction,
  setButtonLoading
} from '../helpers.js';

import { api } from '../api.js';



// ========================================
// Font Awesome Loader
// ========================================

function loadFontAwesome() {
  const existing = document.querySelector(
    'link[data-font-awesome]'
  );

  if (existing) return;

  const link = document.createElement('link');

  link.rel = 'stylesheet';
  link.href =
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';

  link.dataset.fontAwesome = 'true';

  document.head.appendChild(link);
}






// ========================================
// Collections Page State
// ========================================

let pageElement = null;
let collectionsData = [];
let activeModal = null;
let isSaving = false;

// ========================================
// Icon Helpers
// ========================================

function isFontAwesomeIcon(value = '') {
  const classes = String(value)
    .trim()
    .split(/\s+/);

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
    const iconElement = createElement('i', {
      className: value,
      attributes: {
        'aria-hidden': 'true'
      }
    });

    container.appendChild(iconElement);
    return;
  }

  container.textContent = value || '📁';
}

// ========================================
// Helpers
// ========================================

function createMessage(className, titleText, descriptionText) {
  const wrapper = createElement('div', {
    className
  });

  const title = createElement('h3', {
    text: titleText
  });

  const description = createElement('p', {
    text: descriptionText
  });

  wrapper.append(title, description);

  return wrapper;
}

function getCollectionId(name) {
  const slug = createSlug(name);

  if (!slug) {
    return `collection-${Date.now()}`;
  }

  return slug.slice(0, 128);
}

function getCollectionById(id) {
  return collectionsData.find(
    collection => collection.id === id
  );
}

// ========================================
// Render Collection Item
// ========================================

function renderCollectionItem(collection) {
  const item = createElement('article', {
    className: 'collection-card',
    attributes: {
      'data-collection-id': collection.id || ''
    }
  });

  // Header
  const header = createElement('div', {
    className: 'collection-card-header'
  });

  const icon = createElement('div', {
    className: 'collection-icon',
    attributes: {
      'aria-hidden': 'true'
    }
  });

  renderIconContent(icon, collection.icon);

  const info = createElement('div', {
    className: 'collection-info'
  });

  const name = createElement('h3', {
    className: 'collection-name',
    text: collection.name || 'Unnamed Collection'
  });

  const id = createElement('p', {
    className: 'collection-id',
    text: `ID: ${collection.id || 'N/A'}`
  });

  info.append(name, id);

  const status = createElement('span', {
    className: collection.active
      ? 'status-badge status-active collection-status'
      : 'status-badge status-inactive collection-status',
    text: collection.active ? 'Active' : 'Inactive'
  });

  header.append(icon, info, status);

  // Statistics
  const stats = createElement('div', {
    className: 'collection-card-stats'
  });

  const categoriesCount = Array.isArray(collection.categories)
    ? collection.categories.length
    : 0;

  const categoryStat = createElement('div', {
    className: 'collection-stat'
  });

  categoryStat.append(
    createElement('span', {
      className: 'collection-stat-label',
      text: 'Categories'
    }),
    createElement('strong', {
      className: 'collection-stat-value',
      text: categoriesCount
    })
  );

  const subcategoryCount = Array.isArray(collection.categories)
    ? collection.categories.reduce((total, category) => {
        const subcategories =
          category.subCategories ??
          category.subcategories ??
          [];

        return total + (
          Array.isArray(subcategories)
            ? subcategories.length
            : 0
        );
      }, 0)
    : 0;

  const subcategoryStat = createElement('div', {
    className: 'collection-stat'
  });

  subcategoryStat.append(
    createElement('span', {
      className: 'collection-stat-label',
      text: 'Subcategories'
    }),
    createElement('strong', {
      className: 'collection-stat-value',
      text: subcategoryCount
    })
  );

  stats.append(categoryStat, subcategoryStat);

  // Footer
  const footer = createElement('div', {
    className: 'collection-card-footer'
  });

  const actions = createElement('div', {
    className: 'collection-card-actions'
  });

  const editButton = createElement('button', {
    className: 'collection-action-btn',
    text: 'Edit',
    attributes: {
      type: 'button',
      'data-action': 'edit',
      'data-id': collection.id
    }
  });

  const deleteButton = createElement('button', {
    className: 'collection-action-btn danger',
    text: 'Delete',
    attributes: {
      type: 'button',
      'data-action': 'delete',
      'data-id': collection.id
    }
  });

  actions.append(editButton, deleteButton);
  footer.append(actions);

  item.append(
    header,
    stats,
    footer
  );

  return item;
}

// ========================================
// Render Collection List
// ========================================

function renderCollectionList(collections) {
  if (!pageElement) return;

  const list = pageElement.querySelector(
    '#collections-list'
  );

  if (!list) return;

  list.replaceChildren();

  if (!collections.length) {
    list.appendChild(
      createMessage(
        'empty-state collections-empty',
        'No Collections Found',
        'Click Add Collection to create your first collection.'
      )
    );

    return;
  }

  const grid = createElement('div', {
    className: 'collections-grid'
  });

  const fragment = document.createDocumentFragment();

  collections.forEach(collection => {
    fragment.appendChild(
      renderCollectionItem(collection)
    );
  });

  grid.appendChild(fragment);
  list.appendChild(grid);
}

// ========================================
// Search Collections
// ========================================

function filterCollections(searchText = '') {
  const query = searchText.trim().toLowerCase();

  const filtered = collectionsData.filter(collection => {
    const name = String(
      collection.name || ''
    ).toLowerCase();

    const id = String(
      collection.id || ''
    ).toLowerCase();

    return (
      name.includes(query) ||
      id.includes(query)
    );
  });

  renderCollectionList(filtered);
}

// ========================================
// Load Collections From Backend
// ========================================

async function loadCollections({
  forceRefresh = false
} = {}) {
  if (!pageElement) return;

  const list = pageElement.querySelector(
    '#collections-list'
  );

  if (!list) return;

  list.replaceChildren(
    createMessage(
      'loading-state',
      'Loading Collections...',
      'Please wait while collections are loading.'
    )
  );

  try {
    const response = await api.taxonomy.load({
      forceRefresh
    });

    if (!pageElement) return;

    if (!Array.isArray(response.collections)) {
      throw new Error(
        'Invalid collections data received from server.'
      );
    }

    collectionsData = response.collections;

    const searchInput = pageElement.querySelector(
      '#collection-search'
    );

    filterCollections(
      searchInput?.value || ''
    );

    window.dispatchEvent(
      new CustomEvent('taxonomy:loaded', {
        detail: {
          collections: collectionsData,
          version: response.version
        }
      })
    );

  } catch (error) {
    console.error(
      '[COLLECTIONS] Failed to load:',
      error
    );

    if (!pageElement) return;

    list.replaceChildren(
      createMessage(
        'error-state',
        'Unable to Load Collections',
        error.message || 'Please try again.'
      )
    );

    const retryButton = createElement('button', {
      className: 'btn btn-primary',
      text: 'Try Again',
      attributes: {
        type: 'button',
        id: 'retry-collections-btn'
      }
    });

    list.appendChild(retryButton);
  }
}

// ========================================
// Modal Helpers
// ========================================

function closeModal() {
  if (!activeModal) return;

  activeModal.remove();
  activeModal = null;
  isSaving = false;
}

function createFormField({
  label,
  name,
  value = '',
  type = 'text',
  placeholder = '',
  required = false,
  maxLength = 100
}) {
  const wrapper = createElement('div', {
    className: 'form-group'
  });

  const fieldLabel = createElement('label', {
    text: label,
    attributes: {
      for: `collection-field-${name}`
    }
  });

  const input = createElement('input', {
    className: 'form-control',
    attributes: {
      id: `collection-field-${name}`,
      name,
      type,
      value,
      placeholder,
      required,
      maxlength: maxLength,
      autocomplete: 'off'
    }
  });

  wrapper.append(fieldLabel, input);

  return {
    wrapper,
    input
  };
}

// ========================================
// Open Collection Modal
// ========================================

function openCollectionModal(collection = null) {
  if (activeModal) {
    closeModal();
  }

  const isEdit = Boolean(collection);

  const overlay = createElement('div', {
    className: 'modal-overlay',
    attributes: {
      id: 'collection-modal-overlay',
      role: 'presentation'
    }
  });

  const modal = createElement('div', {
    className: 'modal',
    attributes: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'collection-modal-title'
    }
  });

  // Header
  const header = createElement('div', {
    className: 'modal-header'
  });

  const headerContent = createElement('div', {
    className: 'modal-header-content'
  });

  const title = createElement('h2', {
    className: 'modal-title',
    id: 'collection-modal-title',
    text: isEdit
      ? 'Edit Collection'
      : 'Add Collection'
  });

  const subtitle = createElement('p', {
    className: 'modal-subtitle',
    text: isEdit
      ? 'Update collection information.'
      : 'Create a new product collection.'
  });

  headerContent.append(title, subtitle);

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
    className: 'modal-body form-container',
    attributes: {
      id: 'collection-form',
      novalidate: false
    }
  });

  const nameField = createFormField({
    label: 'Collection Name',
    name: 'name',
    value: collection?.name || '',
    placeholder: 'Example: Men, Women, Kids',
    required: true,
    maxLength: 100
  });

  const iconField = createFormField({
    label: 'Icon (Optional)',
    name: 'icon',
    value: collection?.icon || '',
    placeholder: 'Example: 🎁 or fa-solid fa-gift',
    maxLength: 200
  });

  // Icon Preview
  const iconPreviewWrapper = createElement('div', {
    className: 'form-group collection-icon-preview-group'
  });

  const previewLabel = createElement('label', {
    text: 'Icon Preview'
  });

  const iconPreview = createElement('div', {
    className: 'collection-icon collection-icon-preview',
    attributes: {
      'aria-label': 'Collection icon preview'
    }
  });

  const iconHelp = createElement('small', {
    className: 'form-hint',
    text: 'Enter an emoji or Font Awesome class, for example: fa-solid fa-gift'
  });

  renderIconContent(
    iconPreview,
    collection?.icon || ''
  );

  iconPreviewWrapper.append(
    previewLabel,
    iconPreview,
    iconHelp
  );

  iconField.input.addEventListener('input', () => {
    renderIconContent(
      iconPreview,
      iconField.input.value
    );
  });

  form.append(
    nameField.wrapper,
    iconField.wrapper,
    iconPreviewWrapper
  );

  // Collection ID
  const idField = createFormField({
    label: 'Collection ID',
    name: 'id',
    value: collection?.id || '',
    placeholder: 'Automatically generated from name',
    required: true,
    maxLength: 128
  });

  if (isEdit) {
    idField.input.readOnly = true;
    idField.input.classList.add('is-readonly');
  } else {
    idField.input.readOnly = true;
  }

  form.appendChild(idField.wrapper);

  // Active checkbox
  const activeWrapper = createElement('div', {
    className: 'form-group'
  });

  const activeLabel = createElement('label', {
    className: 'checkbox-label'
  });

  const activeInput = createElement('input', {
    attributes: {
      type: 'checkbox',
      name: 'active',
      checked: collection
        ? collection.active !== false
        : true
    }
  });

  const activeText = createElement('span', {
    text: 'Active Collection'
  });

  activeLabel.append(activeInput, activeText);
  activeWrapper.appendChild(activeLabel);

  form.appendChild(activeWrapper);

  // ID preview for new collection
  if (!isEdit) {
    nameField.input.addEventListener('input', () => {
      idField.input.value = getCollectionId(
        nameField.input.value
      );
    });
  }

  // Footer
  const footer = createElement('div', {
    className: 'modal-footer'
  });

  const cancelButton = createElement('button', {
    className: 'btn btn-secondary',
    text: 'Cancel',
    attributes: {
      type: 'button'
    }
  });

  const saveButton = createElement('button', {
    className: 'btn btn-primary',
    text: isEdit
      ? 'Save Changes'
      : 'Create Collection',
    attributes: {
      type: 'submit',
      form: 'collection-form'
    }
  });

  footer.append(cancelButton, saveButton);

  modal.append(
    header,
    form,
    footer
  );

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  activeModal = overlay;

  requestAnimationFrame(() => {
    overlay.classList.add('active');
    nameField.input.focus();
  });

  // Close events
  closeButton.addEventListener('click', closeModal);
  cancelButton.addEventListener('click', closeModal);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  // Form submit
  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (isSaving) return;

    const name = nameField.input.value.trim();
    const icon = iconField.input.value.trim();
    const active = activeInput.checked;

    if (!name) {
      showToast(
        'Collection name is required.',
        'warning'
      );

      nameField.input.focus();
      return;
    }

    if (name.length > 100) {
      showToast(
        'Collection name cannot exceed 100 characters.',
        'warning'
      );

      return;
    }

    const id = isEdit
      ? collection.id
      : getCollectionId(name);

    if (!id || id.length > 128) {
      showToast(
        'Invalid collection ID.',
        'error'
      );

      return;
    }

    const payload = {
      name,
      active,
      icon
    };

    isSaving = true;

    setButtonLoading(
      saveButton,
      true,
      'Saving...'
    );

    cancelButton.disabled = true;
    closeButton.disabled = true;

    try {
      if (isEdit) {
        await api.taxonomy.updateCollection(
          collection.id,
          payload
        );

        showToast(
          'Collection updated successfully.',
          'success'
        );

      } else {
        await api.taxonomy.createCollection({
          id,
          ...payload
        });

        showToast(
          'Collection created successfully.',
          'success'
        );
      }

      api.taxonomy.clearCache();

      closeModal();

      await loadCollections({
        forceRefresh: true
      });

    } catch (error) {
      console.error(
        '[COLLECTIONS] Save failed:',
        error
      );

      showToast(
        error.message || 'Unable to save collection.',
        'error',
        5000
      );

      isSaving = false;

      setButtonLoading(
        saveButton,
        false
      );

      cancelButton.disabled = false;
      closeButton.disabled = false;
    }
  });
}

// ========================================
// Delete Collection
// ========================================

async function deleteCollection(collectionId) {
  const collection = getCollectionById(collectionId);

  if (!collection) {
    showToast(
      'Collection not found.',
      'error'
    );

    return;
  }

  const categoryCount = Array.isArray(collection.categories)
    ? collection.categories.length
    : 0;

  const confirmed = confirmAction(
    `Delete "${collection.name}"?\n\n` +
    `This will also remove its ${categoryCount} categories ` +
    `and their subcategories. This action cannot be undone.`
  );

  if (!confirmed) return;

  try {
    await api.taxonomy.deleteCollection(collectionId);

    api.taxonomy.clearCache();

    showToast(
      'Collection deleted successfully.',
      'success'
    );

    await loadCollections({
      forceRefresh: true
    });

  } catch (error) {
    console.error(
      '[COLLECTIONS] Delete failed:',
      error
    );

    showToast(
      error.message || 'Unable to delete collection.',
      'error',
      5000
    );
  }
}

// ========================================
// Render Page
// ========================================

export async function render() {
   loadFontAwesome();
  const container = createElement('section', {
    className: 'page collections-page',
    attributes: {
      id: 'collections-page'
    }
  });

  // Page Header
  const header = createElement('div', {
    className: 'page-header'
  });

  const heading = createElement('div', {
    className: 'page-heading'
  });

  const title = createElement('h2', {
    className: 'page-title',
    text: 'Collections'
  });

  const description = createElement('p', {
    className: 'page-description',
    text: 'Manage your product collections.'
  });

  heading.append(title, description);

  const addButton = createElement('button', {
    className: 'btn btn-primary',
    text: '+ Add Collection',
    attributes: {
      type: 'button',
      id: 'add-collection-btn'
    }
  });

  header.append(heading, addButton);

  // Toolbar
  const toolbar = createElement('div', {
    className: 'collections-toolbar'
  });

  const toolbarLeft = createElement('div', {
    className: 'collections-toolbar-left'
  });

  const searchInput = createElement('input', {
    className: 'form-control collection-search',
    attributes: {
      type: 'search',
      id: 'collection-search',
      placeholder: 'Search collections...',
      autocomplete: 'off',
      'aria-label': 'Search collections'
    }
  });

  toolbarLeft.appendChild(searchInput);
  toolbar.appendChild(toolbarLeft);

  // List
  const listContainer = createElement('div', {
    className: 'collections-list',
    attributes: {
      id: 'collections-list'
    }
  });

  container.append(
    header,
    toolbar,
    listContainer
  );

  pageElement = container;
  collectionsData = [];

  await loadCollections();

  return container;
}

// ========================================
// Bind Events
// ========================================

export function bindEvents() {
  if (!pageElement) return;

  const addButton = pageElement.querySelector(
    '#add-collection-btn'
  );

  const searchInput = pageElement.querySelector(
    '#collection-search'
  );

  const list = pageElement.querySelector(
    '#collections-list'
  );

  // Add Collection
  addButton?.addEventListener('click', () => {
    openCollectionModal();
  });

  // Search
  searchInput?.addEventListener('input', () => {
    filterCollections(searchInput.value);
  });

  // Collection actions
  list?.addEventListener('click', event => {
    const button = event.target.closest(
      'button[data-action]'
    );

    if (!button || !list.contains(button)) {
      return;
    }

    const action = button.dataset.action;
    const collectionId = button.dataset.id;

    if (!collectionId) return;

    if (action === 'edit') {
      const collection = getCollectionById(
        collectionId
      );

      if (collection) {
        openCollectionModal(collection);
      }

      return;
    }

    if (action === 'delete') {
      deleteCollection(collectionId);
    }
  });

  // Retry
  list?.addEventListener('click', event => {
    if (
      event.target.closest('#retry-collections-btn')
    ) {
      loadCollections({
        forceRefresh: true
      });
    }
  });
}

// ========================================
// Get Loaded Collections
// ========================================

export function getCollections() {
  return [...collectionsData];
}

// ========================================
// Cleanup
// ========================================

export function cleanup() {
  closeModal();

  pageElement = null;
  collectionsData = [];
  isSaving = false;
}
