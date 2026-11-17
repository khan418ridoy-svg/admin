
'use strict';

import {
  $,
  createElement
} from '../helpers.js';

// ========================================
// Page Configuration
// ========================================
const PAGE_MODULES = {
  dashboard: () => import('./dashboard.js'),
  products: () => import('./product/index.js'),
  lots: () => import('./product/lot/list-page.js'),
  collections: () => import('./collections.js'),
  categories: () => import('./categories.js'),
  subcategories: () => import('./subcategories.js')
};

const DEFAULT_PAGE = 'dashboard';

// ========================================
// Router State
// ========================================

let currentPage = null;
let currentPageCleanup = null;

let navigationCallback = null;
let navigationRoot = null;

let navigationId = 0;
let destroyed = false;

let activeAbortController = null;

let cleanupQueue = Promise.resolve();

// ========================================
// Page Container
// ========================================

function getPageContainer() {
  const container = $('#page-content');

  if (!container) {
    throw new Error(
      'Page container #page-content was not found.'
    );
  }

  return container;
}

// ========================================
// Navigation Validation
// ========================================

function isNavigationCurrent(id) {
  return (
    !destroyed &&
    id === navigationId
  );
}

// ========================================
// Active Navigation
// ========================================

function updateActiveNavigation(pageName) {
  const items = document.querySelectorAll(
    '.admin-sidebar [data-page], [data-sidebar-nav][data-page]'
  );

  items.forEach(item => {
    const active = item.dataset.page === pageName;

    item.classList.toggle('active', active);

    if (active) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  // Categories/Subcategories হলে
  // Collections submenu খোলা রাখবে।
  const collectionsGroup = document.querySelector(
    '.sidebar-group'
  );

  const collectionsToggle = document.querySelector(
    '.sidebar-group-link'
  );

  const submenu = document.querySelector(
    '.sidebar-submenu'
  );

  const isCollectionChild = [
    'categories',
    'subcategories'
  ].includes(pageName);

  if (collectionsGroup) {
    collectionsGroup.classList.toggle(
      'submenu-open',
      isCollectionChild
    );
  }

  if (collectionsToggle) {
    collectionsToggle.classList.toggle(
      'active',
      isCollectionChild
    );

    collectionsToggle.setAttribute(
      'aria-expanded',
      String(isCollectionChild)
    );
  }

  if (submenu) {
    submenu.hidden = !isCollectionChild;
  }
}

// ========================================
// Loading UI
// ========================================

function renderPageLoading(container) {
  const loading = createElement('div', {
    className: 'page-loading',
    attributes: {
      role: 'status',
      'aria-live': 'polite'
    }
  });

  const spinner = createElement('div', {
    className: 'loading-spinner',
    attributes: {
      'aria-hidden': 'true'
    }
  });

  const text = createElement('p', {
    text: 'Loading page...'
  });

  loading.append(spinner, text);

  container.replaceChildren(loading);
}

// ========================================
// Error UI
// ========================================

function renderPageError(container, error, retryCallback) {
  const wrapper = createElement('section', {
    className: 'page-error',
    attributes: {
      role: 'alert'
    }
  });

  const title = createElement('h2', {
    text: 'Unable to load page'
  });

  const message = createElement('p', {
    text: error?.message || 'Something went wrong.'
  });

  const retryButton = createElement('button', {
    className: 'btn btn-primary',
    text: 'Try Again',
    attributes: {
      type: 'button'
    }
  });

  retryButton.addEventListener('click', retryCallback);

  wrapper.append(
    title,
    message,
    retryButton
  );

  container.replaceChildren(wrapper);
}

// ========================================
// Page Cleanup
// ========================================

function cleanupCurrentPage() {
  const cleanup = currentPageCleanup;

  currentPageCleanup = null;

  if (typeof cleanup !== 'function') {
    return cleanupQueue;
  }

  cleanupQueue = cleanupQueue
    .catch(error => {
      console.error(
        '[PAGE CLEANUP QUEUE ERROR]',
        error
      );
    })
    .then(async () => {
      await cleanup();
    })
    .catch(error => {
      console.error(
        '[PAGE CLEANUP ERROR]',
        error
      );
    });

  return cleanupQueue;
}

// ========================================
// Renderer Validation
// ========================================

function getPageRenderer(module, pageName) {
  if (typeof module?.render !== 'function') {
    throw new Error(
      `Page "${pageName}" must export a render() function.`
    );
  }

  return module.render;
}

// ========================================
// Page Module Cleanup
// ========================================

async function cleanupModule(module) {
  if (typeof module?.cleanup === 'function') {
    await module.cleanup();
  }
}

// ========================================
// Render Page
// ========================================

export async function renderPage(
  pageName = DEFAULT_PAGE,
  options = {}
) {
  if (destroyed) {
    return false;
  }

  if (!PAGE_MODULES[pageName]) {
    console.warn(
      `[ROUTER] Unknown page: ${pageName}`
    );

    pageName = DEFAULT_PAGE;
  }

  const currentNavigationId = ++navigationId;

  // Abort previous navigation.
  activeAbortController?.abort();

  const abortController = new AbortController();

  activeAbortController = abortController;

  let container = null;
  let module = null;

  try {
    container = getPageContainer();

    // Cleanup previous page.
    await cleanupCurrentPage();

    if (!isNavigationCurrent(currentNavigationId)) {
      return false;
    }

    currentPage = pageName;

    updateActiveNavigation(pageName);

    renderPageLoading(container);

    // Load page module.
    module = await PAGE_MODULES[pageName]();

    if (!isNavigationCurrent(currentNavigationId)) {
      return false;
    }

    const renderer = getPageRenderer(
      module,
      pageName
    );

    // Render page.
    const result = await renderer({
      container,
      pageName,
      options,
      signal: abortController.signal
    });

    // Ignore outdated render.
    if (!isNavigationCurrent(currentNavigationId)) {
      if (typeof result === 'function') {
        await result();
      } else {
        await cleanupModule(module);
      }

      return false;
    }

    // Page modules currently return their root element.
    if (
      result &&
      typeof result.nodeType === 'number' &&
      result !== container
    ) {
      container.replaceChildren(result);
    }

    // Bind events after the page is mounted.
    if (typeof module.bindEvents === 'function') {
      await module.bindEvents({
        container,
        pageName,
        options,
        signal: abortController.signal
      });
    }

    if (!isNavigationCurrent(currentNavigationId)) {
      await cleanupModule(module);
      return false;
    }

    // Save cleanup callback.
    currentPageCleanup =
      typeof result === 'function'
        ? result
        : typeof module.cleanup === 'function'
          ? () => module.cleanup()
          : null;

    return true;

  } catch (error) {
    if (!isNavigationCurrent(currentNavigationId)) {
      return false;
    }

    console.error(
      `[ROUTER] Failed to render "${pageName}":`,
      error
    );

    if (container) {
      renderPageError(
        container,
        error,
        () => renderPage(pageName, options)
      );
    }

    return false;
  }
}

// ========================================
// Navigation Event Binding
// ========================================

export function bindPageNavigation(root = document) {
  // Remove previous listener.
  if (navigationCallback && navigationRoot) {
    navigationRoot.removeEventListener(
      'click',
      navigationCallback
    );
  }

  navigationRoot = root;

  navigationCallback = event => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    // Ignore only submenu toggle controls.
    // Collections link must be allowed to navigate.
    if (
      target.closest(
        '.sidebar-group-toggle, [data-page-toggle]'
      )
    ) {
      return;
    }

    const link = target.closest('[data-page]');

    if (!link || !root.contains(link)) {
      return;
    }

    const pageName = link.dataset.page;

    if (!pageName || !PAGE_MODULES[pageName]) {
      return;
    }

    event.preventDefault();

    navigateTo(pageName);

    document.body.classList.remove('sidebar-open');
  };

  root.addEventListener(
    'click',
    navigationCallback
  );
}

// ========================================
// Programmatic Navigation
// ========================================

export function navigateTo(pageName, options = {}) {
  return renderPage(pageName, options);
}

// ========================================
// Current Page
// ========================================

export function getCurrentPage() {
  return currentPage;
}

// ========================================
// Destroy Router
// ========================================

export async function destroyRouter() {
  destroyed = true;

  // Invalidate pending navigation.
  navigationId++;

  // Abort pending work.
  activeAbortController?.abort();
  activeAbortController = null;

  // Remove navigation listener.
  if (navigationCallback && navigationRoot) {
    navigationRoot.removeEventListener(
      'click',
      navigationCallback
    );
  }

  navigationCallback = null;
  navigationRoot = null;

  // Cleanup current page.
  await cleanupCurrentPage();

  currentPage = null;

  const container = $('#page-content');

  if (container) {
    container.replaceChildren();
  }

  updateActiveNavigation(null);
}

// ========================================
// Initialize Router
// ========================================

export function initializeRouter({
  root = document,
  initialPage = DEFAULT_PAGE
} = {}) {
  destroyed = false;

  bindPageNavigation(root);

  return renderPage(initialPage);
}

// ========================================
// Export
// ========================================

export default {
  initializeRouter,
  renderPage,
  navigateTo,
  bindPageNavigation,
  getCurrentPage,
  destroyRouter
};
