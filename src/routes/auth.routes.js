
'use strict';

const router = require('express').Router();

const adminAuth = require('../middleware/adminAuth');

// ========================================
// POST /api/auth/verify
// Verify Firebase Token + Admin Permission
// ========================================

router.get('/verify', adminAuth, (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      authenticated: true,
      isAdmin: true,

      admin: {
        uid: req.admin.uid,
        email: req.admin.email,
        emailVerified: req.admin.emailVerified
      },

      message: 'Admin authentication successful.'
    });

  } catch (error) {
    console.error('[AUTH VERIFY ERROR]', error.message);

    return res.status(500).json({
      success: false,
      message: 'Unable to verify admin account.'
    });
  }
});

// ========================================
// GET /api/auth/me
// Get Current Admin Information
// ========================================

router.get('/me', adminAuth, (req, res) => {
  return res.status(200).json({
    success: true,
    authenticated: true,

    admin: {
      uid: req.admin.uid,
      email: req.admin.email,
      emailVerified: req.admin.emailVerified
    }
  });
});

// ========================================
// POST /api/auth/logout
// ========================================

// Firebase Logout is performed on the frontend
// using Firebase Auth signOut().
// Backend uses stateless ID Token verification.
// This endpoint does not revoke all user sessions.

router.get('/logout', adminAuth, (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Please complete logout using Firebase signOut on the frontend.'
  });
});

// ========================================
// Exports
// ========================================

module.exports = router;
