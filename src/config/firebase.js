const admin = require('firebase-admin');

function initializeFirebase() {
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  return admin;
}
const firebase = initializeFirebase();
module.exports = { admin: firebase, db: firebase.firestore(), auth: firebase.auth(), FieldValue: firebase.firestore.FieldValue, FieldPath: firebase.firestore.FieldPath };