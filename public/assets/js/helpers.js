
'use strict';

// ========================================
// DOM Selectors
// ========================================

export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

export function $$(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

// ========================================
// DOM Element Creator
// ========================================

export function createElement(
  tag,
  {
    className = '',
    id = '',
    text = '',
    html = '',
    attributes = {},
    dataset = {},
    children = []
  } = {}
) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (id) {
    element.id = id;
  }

  if (text !== '') {
    element.textContent = String(text);
  }

  // Only use html for trusted, developer-controlled markup.
  if (html !== '') {
    element.innerHTML = html;
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== false
    ) {
      if (value === true) {
        element.setAttribute(key, '');
      } else {
        element.setAttribute(key, String(value));
      }
    }
  });

  Object.entries(dataset).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      element.dataset[key] = String(value);
    }
  });

  const childList = Array.isArray(children)
    ? children
    : [children];

  childList.forEach(child => {
    if (child instanceof Node) {
      element.appendChild(child);
    } else if (
      child !== undefined &&
      child !== null &&
      child !== false
    ) {
      element.appendChild(
        document.createTextNode(String(child))
      );
    }
  });

  return element;
}

// ========================================
// HTML Escape
// ========================================

export function escapeHTML(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]
  );
}

// ========================================
// Text Helpers
// ========================================

export function capitalize(value) {
  const text = String(value ?? '').trim();

  if (!text) {
    return '';
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function truncate(value, maxLength = 50) {
  const text = String(value ?? '');

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
}

export function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

// ========================================
// Number Helpers
// ========================================

export function toNumber(value, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

export function formatNumber(
  value,
  {
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    locale = 'en-BD'
  } = {}
) {
  return toNumber(value).toLocaleString(locale, {
    minimumFractionDigits,
    maximumFractionDigits
  });
}

// ========================================
// Currency Helpers
// ========================================

export function formatCurrency(
  value,
  {
    currency = 'BDT',
    locale = 'en-BD',
    maximumFractionDigits = 2
  } = {}
) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits
  }).format(toNumber(value));
}

// ========================================
// Date Helpers
// ========================================

export function formatDate(
  value,
  {
    locale = 'en-BD',
    dateStyle = 'medium'
  } = {}
) {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date
    ? value
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle
  }).format(date);
}

export function formatDateTime(
  value,
  {
    locale = 'en-BD'
  } = {}
) {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date
    ? value
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export function getTodayDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// ========================================
// String / ID Helpers
// ========================================

export function createSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function createId(prefix = 'id') {
  const uniquePart = globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}-${uniquePart}`;
}

// ========================================
// Form Helpers
// ========================================

export function getFormData(form) {
  if (!(form instanceof HTMLFormElement)) {
    throw new TypeError('A valid form element is required');
  }

  return Object.fromEntries(
    new FormData(form).entries()
  );
}

export function setFormValues(form, values = {}) {
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  Object.entries(values).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);

    if (!field) {
      return;
    }

    if (field instanceof RadioNodeList) {
      const target = Array.from(field).find(
        item => item.value === String(value)
      );

      if (target) {
        target.checked = true;
      }

      return;
    }

    if (field.type === 'checkbox') {
      field.checked = Boolean(value);
      return;
    }

    field.value = value ?? '';
  });
}

export function resetForm(form) {
  if (form instanceof HTMLFormElement) {
    form.reset();
  }
}

// ========================================
// Button Loading Helpers
// ========================================

const buttonOriginalText = new WeakMap();

export function setButtonLoading(
  button,
  loading,
  loadingText = 'Please wait...'
) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  if (loading) {
    if (!buttonOriginalText.has(button)) {
      buttonOriginalText.set(
        button,
        button.textContent
      );
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = loadingText;

    return;
  }

  if (buttonOriginalText.has(button)) {
    button.textContent = buttonOriginalText.get(button);
    buttonOriginalText.delete(button);
  }

  button.disabled = false;
  button.removeAttribute('aria-busy');
}

// ========================================
// Visibility Helpers
// ========================================

export function showElement(element) {
  if (element instanceof HTMLElement) {
    element.hidden = false;
  }
}

export function hideElement(element) {
  if (element instanceof HTMLElement) {
    element.hidden = true;
  }
}

export function toggleElement(element, visible) {
  if (element instanceof HTMLElement) {
    element.hidden = !visible;
  }
}

// ========================================
// Debounce / Throttle
// ========================================

export function debounce(callback, delay = 300) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);

    timeoutId = setTimeout(() => {
      callback(...args);
    }, delay);
  };
}

export function throttle(callback, delay = 300) {
  let lastCall = 0;

  return (...args) => {
    const now = Date.now();

    if (now - lastCall < delay) {
      return;
    }

    lastCall = now;

    callback(...args);
  };
}

// ========================================
// Toast Notifications
// ========================================

let toastContainer = null;

function getToastContainer() {
  if (
    toastContainer &&
    toastContainer.isConnected
  ) {
    return toastContainer;
  }

  toastContainer = document.createElement('div');

  toastContainer.className = 'toast-container';
  toastContainer.setAttribute('aria-live', 'polite');
  toastContainer.setAttribute('aria-atomic', 'false');

  document.body.appendChild(toastContainer);

  return toastContainer;
}

export function showToast(
  message,
  type = 'success',
  duration = 3000
) {
  const container = getToastContainer();

  const allowedTypes = [
    'success',
    'error',
    'warning',
    'info'
  ];

  const toastType = allowedTypes.includes(type)
    ? type
    : 'info';

  const toast = createElement('div', {
    className: `toast toast-${toastType}`,
    attributes: {
      role: toastType === 'error'
        ? 'alert'
        : 'status'
    },
    text: message
  });

  container.appendChild(toast);

  const timeout = setTimeout(() => {
    toast.remove();
  }, Math.max(0, duration));

  toast.addEventListener('click', () => {
    clearTimeout(timeout);
    toast.remove();
  });

  return toast;
}

// ========================================
// Confirmation Helper
// ========================================

export function confirmAction(
  message = 'Are you sure?'
) {
  return window.confirm(message);
}

// ========================================
// Empty State
// ========================================

export function createEmptyState(
  message = 'No data found',
  icon = '📂'
) {
  const wrapper = createElement('div', {
    className: 'empty-state'
  });

  const iconElement = createElement('div', {
    className: 'empty-state-icon',
    text: icon
  });

  const messageElement = createElement('p', {
    className: 'empty-state-message',
    text: message
  });

  wrapper.append(iconElement, messageElement);

  return wrapper;
}

// ========================================
// Loading State
// ========================================

export function createLoadingState(
  message = 'Loading...'
) {
  const wrapper = createElement('div', {
    className: 'loading-state',
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
    text: message
  });

  wrapper.append(spinner, text);

  return wrapper;
}

// ========================================
// Safe Local Storage
// ========================================

export const storage = {
  get(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);

      return value === null
        ? fallback
        : JSON.parse(value);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(value)
      );

      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  clear() {
    try {
      localStorage.clear();
      return true;
    } catch {
      return false;
    }
  }
};

// ========================================
// Array Helpers
// ========================================

export function sortByName(items = [], key = 'name') {
  return [...items].sort((a, b) =>
    String(a?.[key] ?? '').localeCompare(
      String(b?.[key] ?? '')
    )
  );
}

export function filterByText(
  items = [],
  search = '',
  keys = ['name']
) {
  const query = normalizeText(search);

  if (!query) {
    return [...items];
  }

  return items.filter(item =>
    keys.some(key =>
      normalizeText(item?.[key]).includes(query)
    )
  );
}

// ========================================
// Export Object
// ========================================

export const helpers = {
  $,
  $$,
  createElement,
  escapeHTML,
  capitalize,
  truncate,
  normalizeText,
  toNumber,
  formatNumber,
  formatCurrency,
  formatDate,
  formatDateTime,
  getTodayDate,
  createSlug,
  createId,
  getFormData,
  setFormValues,
  resetForm,
  setButtonLoading,
  showElement,
  hideElement,
  toggleElement,
  debounce,
  throttle,
  showToast,
  confirmAction,
  createEmptyState,
  createLoadingState,
  storage,
  sortByName,
  filterByText
};
