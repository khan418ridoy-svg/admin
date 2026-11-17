
'use strict';

// ========================================
// PRODUCT AI
// Gemini AI Product Assistance
// ========================================

import {
  getProductElement,
  showProductMessage,
  productApiRequest,
  setProductButtonLoading,
  escapeProductHTML
} from './product-utils.js';

let initialized = false;

let currentSuggestion = null;

const ENDPOINTS = {
  content: '/api/ai/product-content',
  seo: '/api/ai/product-seo',
  attributes: '/api/ai/product-attributes',
  category: '/api/ai/product-category'
};

const SELECTORS = {
  name: '#product-name',
  shortDescription: '#product-short-description',
  description: '#product-description',
  collection: '#product-collection',
  category: '#product-category',
  subcategory: '#product-subcategory',
  fabricType: '#product-fabric-type',
  fit: '#product-fit',
  sleeveType: '#product-sleeve-type',
  washCare: '#product-wash-care',
  tags: '#product-tags',
  slug: '#product-slug',
  metaTitle: '#product-meta-title',
  metaDescription: '#product-meta-description',

  generateContent: '#product-ai-content',
  generateSEO: '#product-ai-seo',
  generateAttributes: '#product-ai-attributes',
  generateCategory: '#product-ai-category',

  preview: '#product-ai-preview',
  previewContent: '#product-ai-preview-content',
  accept: '#product-ai-accept',
  reject: '#product-ai-reject'
};


// ========================================
// GET ELEMENT
// ========================================

function getElement(name) {
  return getProductElement(SELECTORS[name]);
}


// ========================================
// GET PRODUCT FACTS
// ========================================

export function getProductAIFacts() {
  const read = name => getElement(name)?.value?.trim() || '';

  return {
    name: read('name'),
    shortDescription: read('shortDescription'),
    description: read('description'),
    collection: read('collection'),
    category: read('category'),
    subcategory: read('subcategory'),
    fabricType: read('fabricType'),
    fit: read('fit'),
    sleeveType: read('sleeveType'),
    washCare: read('washCare'),
    tags: read('tags')
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
  };
}


// ========================================
// NORMALIZE AI RESPONSE
// ========================================

function normalizeAIResult(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('AI থেকে সঠিক response পাওয়া যায়নি।');
  }

  // Supports { success: true, data: {...} }
  // and { data: {...} } response structures.
  const data = result.data ?? result.result ?? result;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('AI response-এর data format সঠিক নয়।');
  }

  return data;
}


// ========================================
// AI REQUEST
// ========================================

async function requestProductAI(task) {
  const endpoint = ENDPOINTS[task];

  if (!endpoint) {
    throw new Error('Unknown AI task.');
  }

  const facts = getProductAIFacts();

  if (!facts.name) {
    throw new Error('প্রথমে Product Name লিখুন।');
  }

  const result = await productApiRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      product: facts
    })
  });

  return normalizeAIResult(result);
}


// ========================================
// PREVIEW FIELD LABELS
// ========================================

const FIELD_LABELS = {
  shortDescription: 'Short Description',
  description: 'Description',
  metaTitle: 'Meta Title',
  metaDescription: 'Meta Description',
  slug: 'Slug',
  fabricType: 'Fabric Type',
  fit: 'Fit',
  sleeveType: 'Sleeve Type',
  washCare: 'Wash Care',
  tags: 'Tags',
  collection: 'Collection',
  category: 'Category',
  subcategory: 'Subcategory'
};


// ========================================
// VALID AI OUTPUT FIELDS
// ========================================

const TASK_FIELDS = {
  content: [
    'shortDescription',
    'description'
  ],

  seo: [
    'metaTitle',
    'metaDescription',
    'slug',
    'tags'
  ],

  attributes: [
    'fabricType',
    'fit',
    'sleeveType',
    'washCare',
    'tags'
  ],

  category: [
    'collection',
    'category',
    'subcategory'
  ]
};


// ========================================
// SHOW AI PREVIEW
// ========================================

function showAIPreview(task, data) {
  const preview = getElement('preview');
  const content = getElement('previewContent');
  const accept = getElement('accept');
  const reject = getElement('reject');

  if (!preview || !content || !accept || !reject) {
    throw new Error('AI Preview HTML elements পাওয়া যায়নি।');
  }

  const allowedFields = TASK_FIELDS[task] || [];

  const entries = allowedFields
    .filter(key => {
      return (
        Object.prototype.hasOwnProperty.call(data, key) &&
        data[key] !== null &&
        data[key] !== undefined
      );
    })
    .map(key => {
      let value = data[key];

      if (Array.isArray(value)) {
        value = value.join(', ');
      } else if (typeof value === 'object') {
        value = JSON.stringify(value);
      }

      return {
        key,
        label: FIELD_LABELS[key] || key,
        value: String(value)
      };
    });

  if (!entries.length) {
    throw new Error('AI কোনো ব্যবহারযোগ্য suggestion দেয়নি।');
  }

  currentSuggestion = {
    task,
    data: Object.fromEntries(
      entries.map(item => [item.key, item.value])
    )
  };

  content.replaceChildren();

  entries.forEach(item => {
    const wrapper = document.createElement('div');
    wrapper.className = 'product-ai-preview-field';

    const label = document.createElement('strong');
    label.textContent = item.label;

    const value = document.createElement('p');
    value.textContent = item.value;

    wrapper.append(label, value);
    content.appendChild(wrapper);
  });

  preview.hidden = false;
  accept.disabled = false;
  reject.disabled = false;

  preview.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });
}


// ========================================
// GENERATE AI SUGGESTION
// ========================================

export async function generateProductAISuggestion(task, button = null) {
  if (!ENDPOINTS[task]) {
    showProductMessage('AI Task সঠিক নয়।', 'error');
    return false;
  }

  if (button) {
    setProductButtonLoading(button, true, 'Generating...');
  }

  try {
    const data = await requestProductAI(task);

    showAIPreview(task, data);

    showProductMessage(
      'AI Suggestion তৈরি হয়েছে। Preview দেখে Accept করুন।',
      'success'
    );

    return true;

  } catch (error) {
    console.error(`[PRODUCT AI: ${task}]`, error);

    showProductMessage(
      error.message || 'AI Suggestion তৈরি করা যায়নি।',
      'error'
    );

    return false;

  } finally {
    if (button) {
      setProductButtonLoading(button, false);
    }
  }
}


// ========================================
// APPLY AI SUGGESTION
// ========================================

function applySuggestionField(key, value) {
  const element = getProductElement(`#product-${key.replace(
    /[A-Z]/g,
    letter => `-${letter.toLowerCase()}`
  )}`);

  if (!element) {
    console.warn(`[PRODUCT AI] Field not found: ${key}`);
    return false;
  }

  if (element.tagName === 'SELECT') {
    const optionExists = Array.from(element.options).some(
      option => option.value === value
    );

    if (!optionExists) {
      showProductMessage(
        `${FIELD_LABELS[key] || key}: AI suggestion আপনার Taxonomy option-এর সঙ্গে মেলেনি।`,
        'warning'
      );

      return false;
    }
  }

  if (key === 'tags' && element.value !== undefined) {
    element.value = Array.isArray(value)
      ? value.join(', ')
      : String(value);

  } else {
    element.value = String(value);
  }

  element.dispatchEvent(
    new Event('input', { bubbles: true })
  );

  element.dispatchEvent(
    new Event('change', { bubbles: true })
  );

  return true;
}


// ========================================
// ACCEPT AI SUGGESTION
// ========================================

export function acceptProductAISuggestion() {
  if (!currentSuggestion) {
    showProductMessage(
      'কোনো AI Suggestion পাওয়া যায়নি।',
      'warning'
    );

    return false;
  }

  let applied = 0;

  Object.entries(currentSuggestion.data).forEach(
    ([key, value]) => {
      if (applySuggestionField(key, value)) {
        applied++;
      }
    }
  );

  if (applied > 0) {
    showProductMessage(
      'AI Suggestion form-এ বসানো হয়েছে। Product Save করতে Save Button চাপুন।',
      'success'
    );
  }

  closeProductAIPreview();

  return applied > 0;
}


// ========================================
// REJECT AI SUGGESTION
// ========================================

export function rejectProductAISuggestion() {
  closeProductAIPreview();

  showProductMessage(
    'AI Suggestion বাতিল করা হয়েছে।',
    'info'
  );
}


// ========================================
// CLOSE AI PREVIEW
// ========================================

export function closeProductAIPreview() {
  const preview = getElement('preview');
  const content = getElement('previewContent');

  if (preview) {
    preview.hidden = true;
  }

  if (content) {
    content.replaceChildren();
  }

  currentSuggestion = null;
}


// ========================================
// BIND BUTTON
// ========================================

function bindAIButton(name, task) {
  const button = getElement(name);

  if (!button) return;

  button.addEventListener('click', () => {
    generateProductAISuggestion(task, button);
  });
}


// ========================================
// INITIALIZE
// ========================================

export function initProductAI() {
  if (initialized) return;

  const preview = getElement('preview');
  const accept = getElement('accept');
  const reject = getElement('reject');

  if (!preview || !accept || !reject) {
    console.warn('[PRODUCT AI] Preview elements not found.');
    return;
  }

  bindAIButton('generateContent', 'content');
  bindAIButton('generateSEO', 'seo');
  bindAIButton('generateAttributes', 'attributes');
  bindAIButton('generateCategory', 'category');

  accept.addEventListener(
    'click',
    acceptProductAISuggestion
  );

  reject.addEventListener(
    'click',
    rejectProductAISuggestion
  );

  closeProductAIPreview();

  initialized = true;
}

export default initProductAI;
