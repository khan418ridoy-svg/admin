
import "dotenv/config";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const requiredEnv = [
  "FIREBASE_PROJECT_ID"
];

for (const key of requiredEnv) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const projectId = process.env.FIREBASE_PROJECT_ID.trim();

let credential;

// Option 1: Service account JSON stored as an environment variable.
// Option 2: Application Default Credentials (ADC).
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
  let serviceAccount;

  try {
    serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    );
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON contains invalid JSON"
    );
  }

  if (
    !serviceAccount.project_id ||
    !serviceAccount.client_email ||
    !serviceAccount.private_key
  ) {
    throw new Error(
      "Firebase service account JSON is missing required fields"
    );
  }

  if (serviceAccount.project_id !== projectId) {
    throw new Error(
      "FIREBASE_PROJECT_ID does not match service account project_id"
    );
  }

  credential = cert({
    ...serviceAccount,
    private_key: serviceAccount.private_key.replace(/\\n/g, "\n")
  });
} else {
  credential = applicationDefault();
}

const firebaseApp =
  getApps().find((app) => app.name === "fashion-admin") ||
  initializeApp(
    {
      credential,
      projectId
    },
    "fashion-admin"
  );

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// Firestore settings
db.settings({
  ignoreUndefinedProperties: true
});

export {
  firebaseApp,
  auth,
  db
};
