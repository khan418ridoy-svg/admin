
'use strict';

const admin = require('firebase-admin');

// ========================================
// Firebase Configuration
// ========================================

function initializeFirebase() {
  // Prevent duplicate initialization
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccountJSON =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  const projectId =
    process.env.FIREBASE_PROJECT_ID;

  let credential;

  // ======================================
  // Render: Service Account JSON
  // ======================================

  if (serviceAccountJSON) {
    let serviceAccount;

    try {
      serviceAccount = JSON.parse(serviceAccountJSON);
    } catch (error) {
      throw new Error(
        'Invalid FIREBASE_SERVICE_ACCOUNT_JSON format.'
      );
    }

    if (
      !serviceAccount.project_id ||
      !serviceAccount.client_email ||
      !serviceAccount.private_key
    ) {
      throw new Error(
        'Firebase Service Account credentials are incomplete.'
      );
    }

    // Fix escaped newlines from environment variables
    serviceAccount.private_key =
      serviceAccount.private_key.replace(/\\n/g, '\n');

    credential = admin.credential.cert(serviceAccount);
  }

  // ======================================
  // Local Development:
  // GOOGLE_APPLICATION_CREDENTIALS
  // ======================================

  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = admin.credential.applicationDefault();
  }

  // ======================================
  // Missing Credentials
  // ======================================

  else {
    throw new Error(
      'Firebase credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.'
    );
  }

  // ======================================
  // Initialize Firebase Admin
  // ======================================

  return admin.initializeApp({
    credential,

    ...(projectId ? { projectId } : {})
  });
}

// ========================================
// Initialize Firebase
// ========================================

const firebaseApp = initializeFirebase();

// ========================================
// Firestore Connection
// ========================================

const db = admin.firestore(firebaseApp);

// Ignore undefined values in Firestore writes
db.settings({
  ignoreUndefinedProperties: true
});

// ========================================
// Firebase Authentication
// ========================================

const auth = admin.auth(firebaseApp);

// ========================================
// Firestore Helpers
// ========================================

const FieldValue = admin.firestore.FieldValue;

const Timestamp = admin.firestore.Timestamp;

// ========================================
// Exports
// ========================================

module.exports = {
  admin,
  firebaseApp,
  db,
  auth,
  FieldValue,
  Timestamp
};
