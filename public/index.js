
import {
  loginAdmin,
  getCurrentAdmin,
  logoutAdmin
} from "./auth/auth-client.js";

import {
  renderCatalogPage
} from "./assets/js/pages/catalog/index.js";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root element not found");
}

// ==============================
// LOADING
// ==============================

function renderLoading() {
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card auth-loading">
        <div class="brand-mark">F</div>
        <h1>Fashion Admin</h1>
        <p>Checking your session...</p>
        <div class="loading-spinner"></div>
      </section>
    </main>
  `;
}

// ==============================
// LOGIN
// ==============================

function renderLogin(errorMessage = "") {
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card">

        <div class="brand-mark">F</div>

        <div class="auth-heading">
          <p class="eyebrow">ADMINISTRATION</p>
          <h1>Welcome back</h1>
          <p class="auth-subtitle">
            Sign in to manage your fashion business.
          </p>
        </div>

        <form id="login-form" class="login-form">

          <div class="form-group">
            <label for="email">Email address</label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="admin@example.com"
              autocomplete="username"
              required
            >
          </div>

          <div class="form-group">
            <label for="password">Password</label>

            <div class="password-wrapper">
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                autocomplete="current-password"
                required
              >

              <button
                type="button"
                id="toggle-password"
                class="password-toggle"
                aria-label="Show password"
              >
                Show
              </button>
            </div>
          </div>

          <p
            id="login-error"
            class="form-message error-message"
            role="alert"
          ></p>

          <button
            type="submit"
            id="login-button"
            class="primary-button"
          >
            <span class="button-label">Sign in</span>
            <span class="button-loader"></span>
          </button>

        </form>

        <p class="auth-footer">
          Secure administrator access
        </p>

      </section>
    </main>
  `;

  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const toggleButton = document.getElementById("toggle-password");
  const loginButton = document.getElementById("login-button");
  const errorElement = document.getElementById("login-error");

  if (errorMessage) {
    errorElement.textContent = errorMessage;
  }

  toggleButton.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";

    passwordInput.type = isPassword ? "text" : "password";
    toggleButton.textContent = isPassword ? "Hide" : "Show";

    toggleButton.setAttribute(
      "aria-label",
      isPassword ? "Hide password" : "Show password"
    );
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    errorElement.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      errorElement.textContent =
        "Enter your email and password.";

      return;
    }

    loginButton.disabled = true;
    loginButton.classList.add("is-loading");

    loginButton.querySelector(".button-label").textContent =
      "Signing in...";

    try {
      const admin = await loginAdmin(email, password);

      await renderAuthenticated(admin);

    } catch (error) {
      errorElement.textContent =
        error.message || "Unable to sign in. Please try again.";

      loginButton.disabled = false;
      loginButton.classList.remove("is-loading");

      loginButton.querySelector(".button-label").textContent =
        "Sign in";

      passwordInput.value = "";
      passwordInput.focus();
    }
  });
}

// ==============================
// AUTHENTICATED ADMIN PANEL
// ==============================

async function renderAuthenticated(admin) {
  app.innerHTML = `
    <div class="admin-app">

      <header class="admin-topbar">

        <div class="admin-brand">
          <div class="brand-mark">F</div>

          <div>
            <strong>Fashion Admin</strong>
            <span>Management Panel</span>
          </div>
        </div>

        <div class="admin-topbar-actions">

          <div class="admin-profile">
            <span class="admin-avatar">A</span>

            <div>
              <strong id="admin-email"></strong>
              <span>Administrator</span>
            </div>
          </div>

          <button
            type="button"
            id="logout-button"
            class="secondary-button"
          >
            Sign out
          </button>

        </div>

      </header>

      <main id="catalog-root" class="admin-main"></main>

    </div>
  `;

  document.getElementById("admin-email").textContent =
    admin.email || "Administrator";

  const logoutButton = document.getElementById("logout-button");

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Signing out...";

    try {
      await logoutAdmin();
      renderLogin();

    } catch (error) {
      alert(error.message || "Unable to sign out.");

      logoutButton.disabled = false;
      logoutButton.textContent = "Sign out";
    }
  });

  // Open Catalog page after successful authentication
  const catalogRoot = document.getElementById("catalog-root");

  try {
    await renderCatalogPage(catalogRoot);

  } catch (error) {
    console.error("Catalog page error:", error);

    catalogRoot.innerHTML = `
      <section class="catalog-empty">
        <h2>Unable to load Catalog</h2>
        <p>${escapeHTML(error.message)}</p>

        <button
          type="button"
          class="secondary-button"
          onclick="location.reload()"
        >
          Reload page
        </button>
      </section>
    `;
  }
}

// ==============================
// HTML ESCAPE
// ==============================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

// ==============================
// INITIALIZE
// ==============================

async function initializeApp() {
  renderLoading();

  try {
    const admin = await getCurrentAdmin();

    if (admin) {
      await renderAuthenticated(admin);
    } else {
      renderLogin();
    }

  } catch (error) {
    console.error("Session verification failed:", error);

    renderLogin(
      "Unable to verify your session. Please sign in again."
    );
  }
}

initializeApp();
