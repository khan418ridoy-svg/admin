
'use strict';

import {
  loginWithEmail,
  logout,
  observeAuth
} from './firebase-client.js';

import { api, ApiError } from './api.js';

import {
  createElement,
  showToast,
  setButtonLoading
} from './helpers.js';

// ========================================
// Login State
// ========================================

let authObserver = null;
let authObserverReady = false;
let loginInProgress = false;

let loginContainer = null;

// ========================================
// Login UI
// ========================================

function renderLogin(container) {
  if (!(container instanceof HTMLElement)) {
    throw new Error('Login container not found');
  }

  loginContainer = container;

  const wrapper = createElement('main', {
    className: 'login-page'
  });

  const card = createElement('section', {
    className: 'login-card',
    attributes: {
      'aria-labelledby': 'login-title'
    }
  });

  const heading = createElement('div', {
    className: 'login-heading'
  });

  const logo = createElement('div', {
    className: 'login-logo',
    text: 'NF'
  });

  const title = createElement('h1', {
    id: 'login-title',
    className: 'login-title',
    text: 'Admin Login'
  });

  const subtitle = createElement('p', {
    className: 'login-subtitle',
    text: 'Sign in to manage your categories'
  });

  heading.append(logo, title, subtitle);

  const form = createElement('form', {
    className: 'login-form',
    attributes: {
      id: 'admin-login-form',
      novalidate: true
    }
  });

  // Email field
  const emailGroup = createElement('div', {
    className: 'form-group'
  });

  const emailLabel = createElement('label', {
    text: 'Email address',
    attributes: {
      for: 'login-email'
    }
  });

  const emailInput = createElement('input', {
    id: 'login-email',
    className: 'form-control',
    attributes: {
      type: 'email',
      name: 'email',
      placeholder: 'Enter your email',
      autocomplete: 'username',
      required: true,
      maxlength: '254'
    }
  });

  emailGroup.append(emailLabel, emailInput);

  // Password field
  const passwordGroup = createElement('div', {
    className: 'form-group'
  });

  const passwordLabel = createElement('label', {
    text: 'Password',
    attributes: {
      for: 'login-password'
    }
  });

  const passwordWrapper = createElement('div', {
    className: 'password-wrapper'
  });

  const passwordInput = createElement('input', {
    id: 'login-password',
    className: 'form-control',
    attributes: {
      type: 'password',
      name: 'password',
      placeholder: 'Enter your password',
      autocomplete: 'current-password',
      required: true
    }
  });

  const passwordToggle = createElement('button', {
    className: 'password-toggle',
    text: 'Show',
    attributes: {
      type: 'button',
      'aria-label': 'Show password',
      'aria-pressed': 'false'
    }
  });

  passwordWrapper.append(
    passwordInput,
    passwordToggle
  );

  passwordGroup.append(
    passwordLabel,
    passwordWrapper
  );

  // Error message
  const errorMessage = createElement('div', {
    className: 'login-error',
    attributes: {
      id: 'login-error',
      role: 'alert',
      hidden: true
    }
  });

  // Submit button
  const submitButton = createElement('button', {
    className: 'btn btn-primary login-submit',
    text: 'Sign In',
    attributes: {
      type: 'submit'
    }
  });

  form.append(
    emailGroup,
    passwordGroup,
    errorMessage,
    submitButton
  );

  card.append(heading, form);
  wrapper.appendChild(card);

  container.replaceChildren(wrapper);

  // Password visibility
  passwordToggle.addEventListener('click', () => {
    const visible = passwordInput.type === 'password';

    passwordInput.type = visible
      ? 'text'
      : 'password';

    passwordToggle.textContent = visible
      ? 'Hide'
      : 'Show';

    passwordToggle.setAttribute(
      'aria-label',
      visible ? 'Hide password' : 'Show password'
    );

    passwordToggle.setAttribute(
      'aria-pressed',
      String(visible)
    );
  });

  // Submit handler
  form.addEventListener('submit', event => {
    event.preventDefault();

    handleLogin({
      emailInput,
      passwordInput,
      errorMessage,
      submitButton
    });
  });

  emailInput.focus();
}

// ========================================
// Login Error Display
// ========================================

function showLoginError(element, message) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  element.textContent = message;
  element.hidden = false;
}

function clearLoginError(element) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  element.textContent = '';
  element.hidden = true;
}

// ========================================
// Firebase Error Messages
// ========================================

function getFirebaseErrorMessage(error) {
  const code = error?.code || '';

  const messages = {
    'auth/invalid-email':
      'Please enter a valid email address.',

    'auth/invalid-credential':
      'Incorrect email or password.',

    'auth/user-not-found':
      'Incorrect email or password.',

    'auth/wrong-password':
      'Incorrect email or password.',

    'auth/user-disabled':
      'This account has been disabled.',

    'auth/too-many-requests':
      'Too many login attempts. Please try again later.',

    'auth/network-request-failed':
      'Network error. Please check your internet connection.',

    'auth/weak-password':
      'Please use a stronger password.'
  };

  return messages[code] ||
    'Login failed. Please try again.';
}

// ========================================
// Backend Admin Verification
// ========================================

async function verifyAdmin() {
  const result = await api.auth.verify();

  if (!result || result.success !== true) {
    throw new ApiError(
      'Admin verification failed.',
      403,
      result
    );
  }

  return result;
}

// ========================================
// Login Handler
// ========================================

async function handleLogin({
  emailInput,
  passwordInput,
  errorMessage,
  submitButton
}) {
  if (loginInProgress) {
    return;
  }

  clearLoginError(errorMessage);

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showLoginError(
      errorMessage,
      'Email and password are required.'
    );

    return;
  }

  if (!emailInput.validity.valid) {
    showLoginError(
      errorMessage,
      'Please enter a valid email address.'
    );

    emailInput.focus();
    return;
  }

  loginInProgress = true;

  setButtonLoading(
    submitButton,
    true,
    'Signing in...'
  );

  try {
    // Step 1: Firebase Authentication
    await loginWithEmail(email, password);

    // Step 2: Backend Admin UID verification
    await verifyAdmin();

    // Step 3: Login successful
    showToast(
      'Admin login successful',
      'success'
    );

    // app.js auth observer will render the admin panel.
  } catch (error) {
    console.error('[LOGIN ERROR]', error);

    // Remove Firebase session if backend verification fails.
    try {
      await logout();
    } catch (logoutError) {
      console.error(
        '[LOGIN LOGOUT ERROR]',
        logoutError
      );
    }

    if (error instanceof ApiError) {
      if (error.status === 401) {
        showLoginError(
          errorMessage,
          'Authentication failed. Please sign in again.'
        );
      } else if (error.status === 403) {
        showLoginError(
          errorMessage,
          'You do not have admin access.'
        );
      } else if (error.status >= 500) {
        showLoginError(
          errorMessage,
          'Server error. Please try again later.'
        );
      } else {
        showLoginError(
          errorMessage,
          error.message
        );
      }
    } else {
      showLoginError(
        errorMessage,
        getFirebaseErrorMessage(error)
      );
    }
  } finally {
    loginInProgress = false;

    setButtonLoading(
      submitButton,
      false
    );
  }
}

// ========================================
// Logout
// ========================================

export async function logoutAdmin() {
  try {
    await api.auth.logout();

    showToast(
      'You have been logged out.',
      'success'
    );
  } catch (error) {
    console.error('[LOGOUT ERROR]', error);

    // Ensure Firebase session is removed.
    try {
      await logout();
    } catch (logoutError) {
      console.error(logoutError);
    }

    throw error;
  }
}

// ========================================
// Authentication Observer
// ========================================

export function watchAuthentication(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError(
      'Authentication callback must be a function'
    );
  }

  if (authObserver) {
    authObserver();
    authObserver = null;
  }

  authObserverReady = false;

  authObserver = observeAuth(async user => {
    if (!authObserverReady) {
      authObserverReady = true;
    }

    if (!user) {
      callback({
        authenticated: false,
        user: null,
        admin: null
      });

      return;
    }

    try {
      const result = await verifyAdmin();

      callback({
        authenticated: true,
        user,
        admin: result.admin || result.user || null
      });
    } catch (error) {
      console.error(
        '[ADMIN AUTH VERIFICATION ERROR]',
        error
      );

      try {
        await logout();
      } catch (logoutError) {
        console.error(logoutError);
      }

      callback({
        authenticated: false,
        user: null,
        admin: null,
        error
      });
    }
  });

  return () => {
    if (authObserver) {
      authObserver();
      authObserver = null;
    }
  };
}

// ========================================
// Public Login API
// ========================================

export function showLogin(container) {
  renderLogin(container);
}

export function isAuthObserverReady() {
  return authObserverReady;
}
