
import {
  loginAdmin,
  getCurrentAdmin,
  logoutAdmin
} from "./auth/auth-client.js";

import {
  renderCatalogPage
} from "./assets/js/pages/catalog/index.js";

import {
  renderProductsPage
} from "./assets/js/pages/products/index.js";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root element not found");
}

const PAGE_CONFIG = {
  catalog: {
    title: "Catalog Manager",
    subtitle: "Manage collections, categories and subcategories.",
    render: renderCatalogPage
  },

  products: {
    title: "Product Manager",
    subtitle: "Create, manage and organize your products.",
    render: renderProductsPage
  }
};

let currentPage = "catalog";
let currentAdmin = null;
let pageLoading = false;

// =====================================
// HELPERS
// =====================================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

// =====================================
// LOADING
// =====================================

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

// =====================================
// LOGIN
// =====================================

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

            <label for="email">
              Email address
            </label>

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

            <label for="password">
              Password
            </label>

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
          >${escapeHTML(errorMessage)}</p>

          <button
            type="submit"
            id="login-button"
            class="primary-button"
          >

            <span class="button-label">
              Sign in
            </span>

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

  toggleButton.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";

    passwordInput.type = isPassword ? "text" : "password";

    toggleButton.textContent = isPassword ? "Hide" : "Show";

    toggleButton.setAttribute(
      "aria-label",
      isPassword ? "Hide password" : "Show password"
    );
  });

  form.addEventListener("submit", async event => {
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

// =====================================
// ADMIN SHELL
// =====================================

async function renderAuthenticated(admin) {
  currentAdmin = admin;
  currentPage = "catalog";

  app.innerHTML = `
    <div class="admin-app">

      <!-- Mobile Overlay -->
      <div
        class="admin-sidebar-overlay"
        id="admin-sidebar-overlay"
      ></div>

      <!-- Sidebar -->
      <aside
        class="admin-sidebar"
        id="admin-sidebar"
      >

        <div class="admin-sidebar-brand">

          <div class="brand-mark">
            F
          </div>

          <div class="admin-sidebar-brand-text">

            <strong>Fashion Admin</strong>

            <span>Management Panel</span>

          </div>

        </div>

        <div class="admin-sidebar-label">
          MANAGEMENT
        </div>

        <nav
          class="admin-sidebar-nav"
          aria-label="Main navigation"
        >

          <button
            type="button"
            class="admin-nav-item"
            data-page="catalog"
          >

            <span class="admin-nav-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
            </span>

            <span>Catalog</span>

          </button>

          <button
            type="button"
            class="admin-nav-item"
            data-page="products"
          >

            <span class="admin-nav-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 8.5 12 4l8 4.5v8L12 21l-8-4.5z"/>
                <path d="m4.5 8.5 7.5 4.2 7.5-4.2M12 13v8"/>
                <path d="m8 6.2 8 4.5"/>
              </svg>
            </span>

            <span>Product Manager</span>

          </button>

        </nav>

        <div class="admin-sidebar-bottom">

          <div class="admin-sidebar-user">

            <div class="admin-avatar">
              ${escapeHTML(
                (admin.email || "A").charAt(0).toUpperCase()
              )}
            </div>

            <div class="admin-sidebar-user-info">

              <strong id="admin-sidebar-email">
                ${escapeHTML(admin.email || "Administrator")}
              </strong>

              <span>Administrator</span>

            </div>

          </div>

          <button
            type="button"
            id="logout-button"
            class="admin-logout-button"
          >

            <span class="admin-logout-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 17l5-5-5-5"/>
                <path d="M15 12H3"/>
                <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>
              </svg>
            </span>

            <span>Sign out</span>

          </button>

        </div>

      </aside>

      <!-- Main Area -->
      <div class="admin-main-wrapper">

        <header class="admin-topbar">

          <div class="admin-topbar-left">

            <button
              type="button"
              id="sidebar-toggle"
              class="admin-sidebar-toggle"
              aria-label="Toggle sidebar"
              aria-expanded="true"
            >

              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16"/>
              </svg>

            </button>

            <div class="admin-breadcrumb">

              <span>Admin</span>

              <span class="admin-breadcrumb-divider">/</span>

              <strong id="admin-page-title">
                Catalog Manager
              </strong>

            </div>

          </div>

          <div class="admin-topbar-right">

            <span class="admin-topbar-status">
              <span></span>
              System Online
            </span>

          </div>

        </header>

        <main class="admin-main">

          <div class="admin-page-heading">

            <div>
              <h1 id="admin-heading-title">
                Catalog Manager
              </h1>

              <p id="admin-heading-subtitle">
                Manage collections, categories and subcategories.
              </p>
            </div>

          </div>

          <section
            id="admin-page-content"
            class="admin-page-content"
          ></section>

        </main>

      </div>

    </div>
  `;

  bindAdminShellEvents();

  await loadAdminPage("catalog");
}

// =====================================
// SIDEBAR NAVIGATION
// =====================================

function bindAdminShellEvents() {
  const sidebar = document.getElementById("admin-sidebar");
  const overlay = document.getElementById("admin-sidebar-overlay");
  const toggleButton = document.getElementById("sidebar-toggle");
  const logoutButton = document.getElementById("logout-button");

  const navButtons = document.querySelectorAll(
    ".admin-nav-item"
  );

  navButtons.forEach(button => {
    button.addEventListener("click", async () => {
      const page = button.dataset.page;

      if (!PAGE_CONFIG[page]) {
        return;
      }

      closeMobileSidebar();

      await loadAdminPage(page);
    });
  });

  toggleButton.addEventListener("click", () => {
    const isMobile = window.matchMedia(
      "(max-width: 900px)"
    ).matches;

    if (isMobile) {
      const isOpen = sidebar.classList.toggle("is-open");

      overlay.classList.toggle("is-visible", isOpen);

      toggleButton.setAttribute(
        "aria-expanded",
        String(isOpen)
      );

    } else {
      const isCollapsed = document.body.classList.toggle(
        "admin-sidebar-collapsed"
      );

      toggleButton.setAttribute(
        "aria-expanded",
        String(!isCollapsed)
      );
    }
  });

  overlay.addEventListener("click", closeMobileSidebar);

  logoutButton.addEventListener("click", handleLogout);
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("admin-sidebar");
  const overlay = document.getElementById("admin-sidebar-overlay");
  const toggleButton = document.getElementById("sidebar-toggle");

  if (!sidebar || !overlay) {
    return;
  }

  sidebar.classList.remove("is-open");
  overlay.classList.remove("is-visible");

  toggleButton?.setAttribute("aria-expanded", "false");
}

// =====================================
// LOAD ADMIN PAGE
// =====================================

async function loadAdminPage(pageName) {
  const config = PAGE_CONFIG[pageName];

  if (!config || pageLoading) {
    return;
  }

  pageLoading = true;
  currentPage = pageName;

  const content = document.getElementById(
    "admin-page-content"
  );

  const title = document.getElementById(
    "admin-page-title"
  );

  const headingTitle = document.getElementById(
    "admin-heading-title"
  );

  const headingSubtitle = document.getElementById(
    "admin-heading-subtitle"
  );

  if (!content) {
    pageLoading = false;
    return;
  }

  // Active navigation
  document.querySelectorAll(".admin-nav-item").forEach(button => {
    const active = button.dataset.page === pageName;

    button.classList.toggle("active", active);

    button.setAttribute(
      "aria-current",
      active ? "page" : "false"
    );
  });

  title.textContent = config.title;
  headingTitle.textContent = config.title;
  headingSubtitle.textContent = config.subtitle;

  content.innerHTML = `
    <div class="admin-page-loading">
      <div class="loading-spinner"></div>
      <p>Loading ${escapeHTML(config.title)}...</p>
    </div>
  `;

  try {
    const pageRoot = document.createElement("div");

    pageRoot.className = `admin-module admin-module-${pageName}`;

    content.replaceChildren(pageRoot);

    await config.render(pageRoot);

  } catch (error) {
    console.error(`${pageName} page error:`, error);

    content.innerHTML = `
      <section class="admin-page-error">

        <h2>Unable to load ${escapeHTML(config.title)}</h2>

        <p>${escapeHTML(error.message)}</p>

        <button
          type="button"
          class="secondary-button"
          id="admin-page-retry"
        >
          Try Again
        </button>

      </section>
    `;

    document.getElementById("admin-page-retry")
      ?.addEventListener("click", () => {
        pageLoading = false;
        loadAdminPage(pageName);
      });
  } finally {
    pageLoading = false;
  }
}

// =====================================
// LOGOUT
// =====================================

async function handleLogout() {
  const logoutButton = document.getElementById(
    "logout-button"
  );

  if (!logoutButton) {
    return;
  }

  logoutButton.disabled = true;
  logoutButton.innerHTML = `
    <span>Signing out...</span>
  `;

  try {
    await logoutAdmin();

    currentAdmin = null;
    currentPage = "catalog";

    renderLogin();

  } catch (error) {
    console.error("Logout failed:", error);

    alert(error.message || "Unable to sign out.");

    logoutButton.disabled = false;

    logoutButton.innerHTML = `
      <span class="admin-logout-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 17l5-5-5-5"/>
          <path d="M15 12H3"/>
          <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>
        </svg>
      </span>
      <span>Sign out</span>
    `;
  }
}

// =====================================
// INITIALIZE
// =====================================

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
