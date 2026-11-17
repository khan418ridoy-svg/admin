
'use strict';

import { initializeApp, getApps, getApp } from
  'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from
  'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

// ========================================
// Firebase Configuration
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyAKTSoZwVo2RPRBYBs1uzFLyjAhv56CAjc",
  authDomain: "earn-money-f3ff1.firebaseapp.com",
  projectId: "earn-money-f3ff1",
  storageBucket: "earn-money-f3ff1.firebasestorage.app",
  messagingSenderId: "1047231399614",
  appId: "1:1047231399614:web:384da725a257063aeb00ef",
  measurementId: "G-NHMXCV2JXB"
};

// ========================================
// Initialize Firebase
// ========================================

const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

// ========================================
// Firebase Authentication
// ========================================

const auth = getAuth(firebaseApp);

// Keep admin login active after browser refresh.
const authPersistence = setPersistence(
  auth,
  browserLocalPersistence
);

// ========================================
// Authentication Helpers
// ========================================

function loginWithEmail(email, password) {
  return authPersistence.then(() =>
    signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    )
  );
}

function logout() {
  return signOut(auth);
}

function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

async function getCurrentUser() {
  await authPersistence;

  return auth.currentUser;
}

async function getIdToken(forceRefresh = false) {
  await authPersistence;

  const user = auth.currentUser;

  if (!user) {
    return null;
  }

  return user.getIdToken(forceRefresh);
}

// ========================================
// Exports
// ========================================

export {
  firebaseApp,
  auth,
  loginWithEmail,
  logout,
  observeAuth,
  getCurrentUser,
  getIdToken
};
