
'use strict';

const { auth } = require('../config/firebase');

// ========================================
// Admin UID Configuration
// ========================================

function getAdminUIDs() {
  return (process.env.ADMIN_UIDS || '')
    .split(',')
    .map(uid => uid.trim())
    .filter(Boolean);
}

// ========================================
// Bearer Token Extraction
// ========================================

function getBearerToken(req) {
  const authorization = req.headers.authorization;

  if (!authorization || typeof authorization !== 'string') {
    return null;
  }

  const parts = authorization.trim().split(/\s+/);

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1] || null;
}

// ========================================
// Admin Authentication Middleware
// ========================================

async function adminAuth(req, res, next) {
  try {
    // ------------------------------------
    // 1. Check Admin UID Configuration
    // ------------------------------------

    const adminUIDs = getAdminUIDs();

    if (adminUIDs.length === 0) {
      console.error(
        '[ADMIN AUTH] ADMIN_UIDS is not configured.'
      );

      return res.status(503).json({
        success: false,
        message: 'Admin authentication is not configured.'
      });
    }

    // ------------------------------------
    // 2. Extract Firebase ID Token
    // ------------------------------------

    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // ------------------------------------
    // 3. Verify Firebase ID Token
    // Check revoked tokens as well
    // ------------------------------------

    let decodedToken;


    try {
      decodedToken = await auth.verifyIdToken(token, true);
    } catch (error) {
      console.error('[FIREBASE TOKEN ERROR]', {
        code: error.code,
        message: error.message
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication token.'
      });
    }


    // ------------------------------------
    // 4. Verify User UID
    // ------------------------------------

    const uid = decodedToken.uid;

    if (!uid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user identity.'
      });
    }

    // ------------------------------------
    // 5. Admin Allowlist Verification
    // ------------------------------------

    if (!adminUIDs.includes(uid)) {
      console.warn('[ADMIN AUTH] Unauthorized access attempt:', {
        uid,
        path: req.originalUrl
      });

      return res.status(403).json({
        success: false,
        message: 'You are not authorized to access this panel.'
      });
    }

    // ------------------------------------
    // 6. Attach Verified Admin
    // ------------------------------------

    req.admin = {
      uid,
      email: decodedToken.email || null,
      emailVerified: decodedToken.email_verified === true
    };

    // ------------------------------------
    // 7. Continue
    // ------------------------------------

    return next();

  } catch (error) {
    console.error('[ADMIN AUTH ERROR]', error.message);

    return res.status(500).json({
      success: false,
      message: 'Authentication service error.'
    });
  }
}

// ========================================
// Exports
// ========================================

module.exports = adminAuth;
