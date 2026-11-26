
import { auth } from "../config/firebase.js";

const SESSION_EXPIRES_IN = 5 * 24 * 60 * 60 * 1000; // 5 days

function createAuthError(message, status = 401) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Check whether a Firebase UID is listed as an admin.
 */
function isAdmin(uid) {
  const adminUids = (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return adminUids.includes(uid);
}

/**
 * Verify Firebase ID token and create an admin session cookie.
 */
export async function createAdminSession(idToken) {
  if (!idToken || typeof idToken !== "string") {
    throw createAuthError("Firebase ID token is required");
  }

  let decodedToken;

  try {
    decodedToken = await auth.verifyIdToken(idToken, true);
  } catch {
    throw createAuthError("Invalid or expired login token");
  }

  if (!isAdmin(decodedToken.uid)) {
    throw createAuthError("Admin access is not allowed", 403);
  }

  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRES_IN
  });

  return {
    sessionCookie,
    expiresIn: SESSION_EXPIRES_IN,
    admin: {
      uid: decodedToken.uid,
      email: decodedToken.email || null
    }
  };
}

/**
 * Verify an existing admin session cookie.
 */
export async function verifyAdminSession(sessionCookie) {
  if (!sessionCookie || typeof sessionCookie !== "string") {
    throw createAuthError("Authentication required");
  }

  let decodedClaims;

  try {
    decodedClaims = await auth.verifySessionCookie(
      sessionCookie,
      true
    );
  } catch {
    throw createAuthError("Session is invalid or expired");
  }

  if (!isAdmin(decodedClaims.uid)) {
    throw createAuthError("Admin access is not allowed", 403);
  }

  return {
    uid: decodedClaims.uid,
    email: decodedClaims.email || null
  };
}

/**
 * Session cookie expiration duration.
 */
export function getSessionExpiresIn() {
  return SESSION_EXPIRES_IN;
}
