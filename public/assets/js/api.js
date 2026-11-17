
'use strict';

import { getIdToken, logout } from './firebase-client.js';

// ========================================
// Configuration
// ========================================

const API_BASE_URL = '/api';

const TAXONOMY_CACHE_KEY = 'taxonomy_cache_v1';

const DEFAULT_HEADERS = {
  Accept: 'application/json'
};

// ========================================
// API Error
// ========================================

export class ApiError extends Error {
  constructor(message, status = 500, data = null) {
    super(message);

    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// ========================================
// URL Helper
// ========================================

function buildUrl(path, params = {}) {
  const cleanPath = String(path).replace(/^\/+/, '');

  const url = new URL(
    `${API_BASE_URL}/${cleanPath}`,
    window.location.origin
  );

  Object.entries(params).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
}

// ========================================
// Response Handler
// ========================================

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  let data = null;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();

    data = text ? { message: text } : null;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `API request failed (${response.status})`;

    throw new ApiError(
      message,
      response.status,
      data
    );
  }

  return data;
}

// ========================================
// Core Request
// ========================================

async function request(
  method,
  path,
  {
    params = {},
    body,
    headers = {},
    authenticated = true,
    signal
  } = {}
) {
  const requestHeaders = {
    ...DEFAULT_HEADERS,
    ...headers
  };

  if (authenticated) {
    const token = await getIdToken();

    if (!token) {
      throw new ApiError(
        'Authentication required. Please login again.',
        401
      );
    }

    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const options = {
    method,
    headers: requestHeaders,
    signal,
    credentials: 'same-origin'
  };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';

    options.body = JSON.stringify(body);
  }

  const response = await fetch(
    buildUrl(path, params),
    options
  );

  const data = await parseResponse(response);

  return data;
}

// ========================================
// HTTP Methods
// ========================================

function get(path, params = {}, options = {}) {
  return request('GET', path, {
    ...options,
    params
  });
}

function post(path, body = {}, options = {}) {
  return request('POST', path, {
    ...options,
    body
  });
}

function patch(path, body = {}, options = {}) {
  return request('PATCH', path, {
    ...options,
    body
  });
}

function put(path, body = {}, options = {}) {
  return request('PUT', path, {
    ...options,
    body
  });
}

function remove(path, options = {}) {
  return request('DELETE', path, options);
}

// ========================================
// Authentication API
// ========================================

const authApi = {
  verify() {
    return get('auth/verify');
  },

  me() {
    return get('auth/me');
  },

  async logout() {
    try {
      await post('auth/logout');
    } catch (error) {
      // Local Firebase logout must still happen.
      console.warn('[API] Backend logout failed:', error.message);
    } finally {
      await logout();
      clearTaxonomyCache();
    }
  }
};

// ========================================
// Taxonomy Cache
// ========================================

let taxonomyRequestPromise = null;

function readTaxonomyCache() {
  try {
    const raw = localStorage.getItem(TAXONOMY_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const cache = JSON.parse(raw);

    if (
      !cache ||
      !Number.isSafeInteger(cache.version) ||
      cache.version < 0 ||
      !Array.isArray(cache.collections)
    ) {
      clearTaxonomyCache();
      return null;
    }

    return cache;
  } catch {
    clearTaxonomyCache();
    return null;
  }
}

function saveTaxonomyCache(data) {
  if (
    !data ||
    !Number.isSafeInteger(Number(data.version)) ||
    !Array.isArray(data.collections)
  ) {
    throw new ApiError(
      'Invalid taxonomy cache data',
      500
    );
  }

  const cache = {
    version: Number(data.version),
    updatedAt: Number(data.updatedAt) || 0,
    collections: data.collections
  };

  try {
    localStorage.setItem(
      TAXONOMY_CACHE_KEY,
      JSON.stringify(cache)
    );
  } catch (error) {
    console.warn(
      '[API] Could not save taxonomy cache:',
      error
    );
  }

  return cache;
}

function clearTaxonomyCache() {
  try {
    localStorage.removeItem(TAXONOMY_CACHE_KEY);
  } catch (error) {
    console.warn(
      '[API] Could not clear taxonomy cache:',
      error
    );
  }
}

// ========================================
// Load Taxonomy With Version Cache
// ========================================

/**
 * Flow:
 *
 * 1. Read browser localStorage.
 * 2. Send cached version to backend.
 * 3. Backend reads meta/taxonomy.
 * 4. Same version = no taxonomyCollections reads.
 * 5. Different version = backend returns all collections.
 * 6. Save new cache.
 */

async function loadTaxonomy({
  forceRefresh = false
} = {}) {
  if (taxonomyRequestPromise && !forceRefresh) {
    return taxonomyRequestPromise;
  }

  taxonomyRequestPromise = (async () => {
    const cached = forceRefresh
      ? null
      : readTaxonomyCache();

    const response = await get('taxonomy', {
      version: cached?.version
    });

    if (response.unchanged === true) {
      if (
        !cached ||
        response.version !== cached.version
      ) {
        throw new ApiError(
          'Taxonomy cache version mismatch. Please refresh.',
          500,
          response
        );
      }

      return {
        version: cached.version,
        updatedAt: cached.updatedAt,
        collections: cached.collections,
        fromCache: true
      };
    }

    if (!Array.isArray(response.collections)) {
      throw new ApiError(
        'Invalid taxonomy response from server',
        500,
        response
      );
    }

    const newCache = saveTaxonomyCache(response);

    return {
      ...newCache,
      fromCache: false
    };
  })();

  try {
    return await taxonomyRequestPromise;
  } finally {
    taxonomyRequestPromise = null;
  }
}

// ========================================
// Taxonomy API
// ========================================

const taxonomyApi = {
  load: loadTaxonomy,

  clearCache: clearTaxonomyCache,

  getVersion() {
    return get('taxonomy/version');
  },

  getCollection(collectionId) {
    return get(
      `taxonomy/${encodeURIComponent(collectionId)}`
    );
  },

  createCollection(data) {
    return post('taxonomy/collections', data);
  },

  updateCollection(collectionId, data) {
    return patch(
      `taxonomy/${encodeURIComponent(collectionId)}`,
      data
    );
  },

  deleteCollection(collectionId) {
    return remove(
      `taxonomy/${encodeURIComponent(collectionId)}`
    );
  },

  createCategory(collectionId, data) {
    return post(
      `taxonomy/${encodeURIComponent(collectionId)}/categories`,
      data
    );
  },

  updateCategory(collectionId, categoryId, data) {
    return patch(
      `taxonomy/${encodeURIComponent(collectionId)}/categories/${encodeURIComponent(categoryId)}`,
      data
    );
  },

  deleteCategory(collectionId, categoryId) {
    return remove(
      `taxonomy/${encodeURIComponent(collectionId)}/categories/${encodeURIComponent(categoryId)}`
    );
  },

  createSubcategory(collectionId, categoryId, data) {
    return post(
      `taxonomy/${encodeURIComponent(collectionId)}/categories/${encodeURIComponent(categoryId)}/subcategories`,
      data
    );
  },

  updateSubcategory(
    collectionId,
    categoryId,
    subCategoryId,
    data
  ) {
    return patch(
      `taxonomy/${encodeURIComponent(collectionId)}/categories/${encodeURIComponent(categoryId)}/subcategories/${encodeURIComponent(subCategoryId)}`,
      data
    );
  },

  deleteSubcategory(
    collectionId,
    categoryId,
    subCategoryId
  ) {
    return remove(
      `taxonomy/${encodeURIComponent(collectionId)}/categories/${encodeURIComponent(categoryId)}/subcategories/${encodeURIComponent(subCategoryId)}`
    );
  }
};

// ========================================
// Export
// ========================================

export const api = {
  request,
  get,
  post,
  patch,
  put,
  delete: remove,

  auth: authApi,
  taxonomy: taxonomyApi
};

export {
  readTaxonomyCache,
  saveTaxonomyCache,
  clearTaxonomyCache,
  loadTaxonomy
};
