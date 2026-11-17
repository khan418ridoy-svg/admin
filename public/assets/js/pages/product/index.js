
'use strict';

import { createElement } from '../../helpers.js';

// ========================================
// Render Products Page
// ========================================

export function render() {
  const page = createElement('section', {
    className: 'products-page'
  });

  const title = createElement('h2', {
    text: 'Products'
  });

  const description = createElement('p', {
    text: 'Manage your products here.'
  });

  page.append(
    title,
    description
  );

  return page;
}

// ========================================
// Bind Events
// ========================================

export function bindEvents({ container }) {
  console.log(
    '[PRODUCTS] Page initialized',
    container
  );
}

// ========================================
// Cleanup
// ========================================

export function cleanup() {
  console.log('[PRODUCTS] Page cleaned up');
}
