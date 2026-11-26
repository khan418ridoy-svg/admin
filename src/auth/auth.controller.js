
import {
  createAdminSession,
  verifyAdminSession,
  getSessionExpiresIn
} from "./auth.service.js";

const SESSION_COOKIE_NAME = "admin_session";

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/"
  };
}

/**
 * POST /api/auth/login
 */
export async function login(req, res) {
  const { idToken } = req.body || {};

  const session = await createAdminSession(idToken);

  res.cookie(
    SESSION_COOKIE_NAME,
    session.sessionCookie,
    {
      ...getCookieOptions(),
      maxAge: getSessionExpiresIn()
    }
  );

  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    success: true,
    message: "Login successful",
    admin: session.admin
  });
}

/**
 * POST /api/auth/logout
 */
export function logout(req, res) {
  res.clearCookie(
    SESSION_COOKIE_NAME,
    getCookieOptions()
  );

  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    success: true,
    message: "Logout successful"
  });
}

/**
 * GET /api/auth/me
 */
export async function me(req, res) {
  const sessionCookie = req.cookies?.[SESSION_COOKIE_NAME];

  const admin = await verifyAdminSession(sessionCookie);

  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    success: true,
    admin
  });
}
