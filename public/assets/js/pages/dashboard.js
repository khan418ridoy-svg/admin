
'use strict';

import {
  createElement
} from '../helpers.js';

// ========================================
// Dashboard Page
// ========================================

let pageElement = null;

// ========================================
// Render Dashboard
// ========================================

export function render() {
  const container = createElement('section', {
    className: 'page dashboard-page',
    attributes: {
      id: 'dashboard-page'
    }
  });

  const header = createElement('div', {
    className: 'page-header'
  });

  const title = createElement('h2', {
    className: 'page-title',
    text: 'Dashboard'
  });

  const description = createElement('p', {
    className: 'page-description',
    text: 'Welcome to your admin dashboard.'
  });

  header.append(title, description);

  // Dashboard Welcome Card
  const welcomeCard = createElement('div', {
    className: 'dashboard-welcome card'
  });

  const welcomeTitle = createElement('h3', {
    text: 'Welcome to Admin Panel'
  });

  const welcomeText = createElement('p', {
    text: 'Manage your collections, categories and subcategories from the sidebar.'
  });

  welcomeCard.append(welcomeTitle, welcomeText);

  // Dashboard Quick Links
  const quickLinks = createElement('div', {
    className: 'dashboard-quick-links'
  });

  const linksTitle = createElement('h3', {
    text: 'Quick Access'
  });

  const linksGrid = createElement('div', {
    className: 'dashboard-quick-grid'
  });

  const links = [
    {
      title: 'Collections',
      description: 'Manage your collections.',
      page: 'collections'
    },
    {
      title: 'Categories',
      description: 'Manage your categories.',
      page: 'categories'
    },
    {
      title: 'Subcategories',
      description: 'Manage your subcategories.',
      page: 'subcategories'
    }
  ];

  links.forEach((item) => {
    const card = createElement('button', {
      className: 'dashboard-quick-card',
      attributes: {
        type: 'button',
        'data-page': item.page
      }
    });

    const cardTitle = createElement('h4', {
      text: item.title
    });

    const cardDescription = createElement('p', {
      text: item.description
    });

    card.append(cardTitle, cardDescription);
    linksGrid.appendChild(card);
  });

  quickLinks.append(linksTitle, linksGrid);

  container.append(header, welcomeCard, quickLinks);

  pageElement = container;

  return container;
}

// ========================================
// Bind Dashboard Events
// ========================================

export function bindEvents() {
  if (!pageElement) return;

  const buttons = pageElement.querySelectorAll('[data-page]');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const page = button.dataset.page;

      if (!page) return;

      window.location.hash = page;
    });
  });
}

// ========================================
// Cleanup Dashboard
// ========================================

export function cleanup() {
  pageElement = null;
}
