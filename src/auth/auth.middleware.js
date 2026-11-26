
import { verifyAdminSession } from "./auth.service.js";

const SESSION_COOKIE_NAME = "admin_session";

/**
 * Require authenticated admin session.
 */
export async function requireAdmin(req, res, next) {
  try {
    const sessionCookie = req.cookies?.[SESSION_COOKIE_NAME];

    const admin = await verifyAdminSession(sessionCookie);

    req.admin = admin;

    return next();
  } catch (error) {
    const status = error.status || 401;

    return res.status(status).json({
      success: false,
      message:
        status === 403
          ? "Admin access denied"
          : "Authentication required"
    });
  }
}
