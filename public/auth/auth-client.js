
import { getFirebaseConfig } from "../config/firebase-config.js";

const API_BASE = "/api";

async function firebaseLogin(email, password) {
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const config = await getFirebaseConfig();

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
        returnSecureToken: true
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    const errorCode = result.error?.message;

    const messages = {
      EMAIL_NOT_FOUND: "Account not found",
      INVALID_PASSWORD: "Incorrect password",
      INVALID_LOGIN_CREDENTIALS: "Invalid email or password",
      USER_DISABLED: "This account has been disabled"
    };

    throw new Error(
      messages[errorCode] || "Firebase login failed"
    );
  }

  return result;
}

/**
 * Login with Firebase and create backend admin session.
 * Backend independently checks ADMIN_UIDS.
 */
export async function loginAdmin(email, password) {
  const firebaseUser = await firebaseLogin(email, password);

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      idToken: firebaseUser.idToken
    })
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(
      result.message || "Admin authentication failed"
    );
  }

  return result.admin;
}

/**
 * Check current backend admin session.
 */
export async function getCurrentAdmin() {
  const response = await fetch(`${API_BASE}/auth/me`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store"
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    return null;
  }

  return result.admin;
}

/**
 * Logout current admin session.
 */
export async function logoutAdmin() {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "same-origin"
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Logout failed");
  }

  return true;
}
