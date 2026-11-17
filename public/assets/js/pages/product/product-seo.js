
'use strict';

// ========================================
// PRODUCT SEO
// Slug, Meta Title & Meta Description
// ========================================

import {
  getProductElement,
  showProductMessage
} from './product-utils.js';

let initialized = false;

const SELECTORS = {
  slug: '#product-slug',
  metaTitle: '#product-meta-title',
  metaDescription: '#product-meta-description',
  titleCounter: '#product-meta-title-counter',
  descriptionCounter: '#product-meta-description-counter'
};


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    slug: getProductElement(SELECTORS.slug),
    metaTitle: getProductElement(SELECTORS.metaTitle),
    metaDescription: getProductElement(SELECTORS.metaDescription),
    titleCounter: getProductElement(SELECTORS.titleCounter),
    descriptionCounter: getProductElement(SELECTORS.descriptionCounter)
  };
}


// ========================================
// GENERATE SLUG
// ========================================

export function generateProductSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}


// ========================================
// UPDATE COUNTERS
// ========================================

function updateCounters() {
  const elements = getElements();

  if (elements.titleCounter && elements.metaTitle) {
    elements.titleCounter.textContent =
      `${elements.metaTitle.value.length} / 60`;
  }

  if (
    elements.descriptionCounter &&
    elements.metaDescription
  ) {
    elements.descriptionCounter.textContent =
      `${elements.metaDescription.value.length} / 160`;
  }
}


// ========================================
// GET SEO DATA
// ========================================

export function getProductSEOData() {
  const elements = getElements();

  return {
    slug: elements.slug?.value.trim() || '',
    metaTitle: elements.metaTitle?.value.trim() || '',
    metaDescription:
      elements.metaDescription?.value.trim() || ''
  };
}


// ========================================
// SET SEO DATA
// ========================================

export function setProductSEOData(data = {}) {
  const elements = getElements();

  if (elements.slug) {
    elements.slug.value = data.slug || '';
  }

  if (elements.metaTitle) {
    elements.metaTitle.value = data.metaTitle || '';
  }

  if (elements.metaDescription) {
    elements.metaDescription.value =
      data.metaDescription || '';
  }

  updateCounters();
}


// ========================================
// VALIDATE SEO
// ========================================

export function validateProductSEO() {
  const elements = getElements();

  const title = elements.metaTitle?.value.trim() || '';
  const description =
    elements.metaDescription?.value.trim() || '';

  if (title.length > 60) {
    showProductMessage(
      'Meta Title সর্বোচ্চ 60 অক্ষর হতে পারবে।',
      'warning'
    );

    elements.metaTitle?.focus();
    return false;
  }

  if (description.length > 160) {
    showProductMessage(
      'Meta Description সর্বোচ্চ 160 অক্ষর হতে পারবে।',
      'warning'
    );

    elements.metaDescription?.focus();
    return false;
  }

  const slug = elements.slug?.value.trim() || '';

  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    showProductMessage(
      'Slug-এ শুধু English letter, number ও hyphen ব্যবহার করুন।',
      'warning'
    );

    elements.slug?.focus();
    return false;
  }

  return true;
}


// ========================================
// RESET SEO
// ========================================

export function resetProductSEO() {
  const elements = getElements();

  if (elements.slug) elements.slug.value = '';
  if (elements.metaTitle) elements.metaTitle.value = '';
  if (elements.metaDescription) {
    elements.metaDescription.value = '';
  }

  updateCounters();
}


// ========================================
// BIND EVENTS
// ========================================

function bindEvents() {
  const elements = getElements();

  elements.metaTitle?.addEventListener(
    'input',
    updateCounters
  );

  elements.metaDescription?.addEventListener(
    'input',
    updateCounters
  );
}


// ========================================
// INITIALIZE
// ========================================

export function initProductSEO() {
  if (initialized) return;

  const elements = getElements();

  if (
    !elements.slug ||
    !elements.metaTitle ||
    !elements.metaDescription
  ) {
    console.warn('[PRODUCT SEO] Required elements not found.');
    return;
  }

  bindEvents();
  updateCounters();

  initialized = true;
}

export default initProductSEO;
