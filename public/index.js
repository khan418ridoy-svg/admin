
import {
  loginAdmin,
  getCurrentAdmin,
  logoutAdmin
} from "./auth/auth-client.js";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root element not found");
}

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
      errorElement.textContent = "Enter your email and password.";
      return;
    }

    loginButton.disabled = true;
    loginButton.classList.add("is-loading");
    loginButton.querySelector(".button-label").textContent = "Signing in...";

    try {
      const admin = await loginAdmin(email, password);

      renderAuthenticated(admin);
    } catch (error) {
      errorElement.textContent =
        error.message || "Unable to sign in. Please try again.";

      loginButton.disabled = false;
      loginButton.classList.remove("is-loading");
      loginButton.querySelector(".button-label").textContent = "Sign in";
      passwordInput.value = "";
      passwordInput.focus();
    }
  });
}

function renderAuthenticated(admin) {
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card success-card">
        <div class="success-icon">✓</div>

        <p class="eyebrow">AUTHENTICATED</p>
        <h1>Login successful</h1>

        <p class="auth-subtitle">
          Your administrator session is active.
        </p>

        <div class="admin-info">
          <div class="admin-info-row">
            <span>Admin email</span>
            <strong id="admin-email"></strong>
          </div>

          <div class="admin-info-row">
            <span>Admin UID</span>
            <strong id="admin-uid"></strong>
          </div>

          <div class="admin-info-row">
            <span>Session</span>
            <strong class="session-active">Active</strong>
          </div>
        </div>

        <p
          id="logout-error"
          class="form-message error-message"
          role="alert"
        ></p>

        <button
          type="button"
          id="logout-button"
          class="secondary-button"
        >
          Sign out
        </button>
      </section>
    </main>
  `;

  document.getElementById("admin-email").textContent =
    admin.email || "Not available";

  document.getElementById("admin-uid").textContent =
    admin.uid || "Not available";

  const logoutButton = document.getElementById("logout-button");
  const logoutError = document.getElementById("logout-error");

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Signing out...";
    logoutError.textContent = "";

    try {
      await logoutAdmin();
      renderLogin();
    } catch (error) {
      logoutError.textContent =
        error.message || "Unable to sign out.";

      logoutButton.disabled = false;
      logoutButton.textContent = "Sign out";
    }
  });
}

async function initializeApp() {
  renderLoading();

  try {
    const admin = await getCurrentAdmin();

    if (admin) {
      renderAuthenticated(admin);
    } else {
      renderLogin();
    }
  } catch {
    renderLogin("Unable to verify your session. Please try again.");
  }
}

initializeApp();
