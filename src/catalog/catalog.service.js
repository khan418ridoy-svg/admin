
import { db } from "../config/firebase.js";

import {
  validateCollection,
  validateCollectionUpdate,
  validateCollectionId
} from "./catalog.validator.js";

const COLLECTIONS = "taxonomyCollections";
const META_COLLECTION = "taxonomyMeta";
const VERSION_DOCUMENT = "version";

function createServiceError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getCollectionRef(collectionId) {
  const id = validateCollectionId(collectionId);
  return db.collection(COLLECTIONS).doc(id);
}

function getVersionRef() {
  return db.collection(META_COLLECTION).doc(VERSION_DOCUMENT);
}

function normalizeVersion(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const version = Number(value);

  if (!Number.isSafeInteger(version) || version < 0) {
    throw createServiceError("Invalid taxonomy version");
  }

  return version;
}

function incrementTaxonomyVersion(transaction, versionRef, versionSnapshot) {
  const currentVersion = versionSnapshot.exists
    ? Number(versionSnapshot.data().version) || 0
    : 0;

  const nextVersion = currentVersion + 1;
  const updatedAt = Date.now();

  transaction.set(
    versionRef,
    {
      version: nextVersion,
      updatedAt
    },
    { merge: true }
  );

  return {
    version: nextVersion,
    updatedAt
  };
}

export async function getTaxonomy(clientVersion) {
  const requestedVersion = normalizeVersion(clientVersion);
  const versionRef = getVersionRef();

  const versionSnapshot = await versionRef.get();

  const metadata = versionSnapshot.exists
    ? versionSnapshot.data()
    : { version: 0, updatedAt: null };

  const currentVersion = Number(metadata.version) || 0;

  if (
    requestedVersion !== null &&
    requestedVersion === currentVersion
  ) {
    return {
      notModified: true,
      version: currentVersion,
      updatedAt: metadata.updatedAt ?? null
    };
  }

  const snapshot = await db.collection(COLLECTIONS).get();

  const collections = snapshot.docs
    .map((document) => ({
      id: document.id,
      ...document.data()
    }))
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );

  return {
    notModified: false,
    version: currentVersion,
    updatedAt: metadata.updatedAt ?? null,
    collections
  };
}

export async function getCollection(collectionId) {
  const documentRef = getCollectionRef(collectionId);
  const snapshot = await documentRef.get();

  if (!snapshot.exists) {
    throw createServiceError("Collection not found", 404);
  }

  return {
    id: snapshot.id,
    ...snapshot.data()
  };
}

export async function createCollection(data) {
  const collection = validateCollection(data);

  const documentRef = getCollectionRef(collection.id);
  const versionRef = getVersionRef();

  return db.runTransaction(async (transaction) => {
    // সব reads আগে করতে হবে
    const existingSnapshot = await transaction.get(documentRef);
    const versionSnapshot = await transaction.get(versionRef);

    if (existingSnapshot.exists) {
      throw createServiceError(
        "Collection ID already exists",
        409
      );
    }

    const now = Date.now();

    const documentData = {
      ...collection,
      createdAt: now,
      updatedAt: now
    };

    // এরপর writes
    transaction.create(documentRef, documentData);

    const metadata = incrementTaxonomyVersion(
      transaction,
      versionRef,
      versionSnapshot
    );

    return {
      collection: {
        id: collection.id,
        ...documentData
      },
      version: metadata.version,
      updatedAt: metadata.updatedAt
    };
  });
}

export async function updateCollection(collectionId, data) {
  const id = validateCollectionId(collectionId);
  const updates = validateCollectionUpdate(data);

  const documentRef = getCollectionRef(id);
  const versionRef = getVersionRef();

  return db.runTransaction(async (transaction) => {
    // সব reads আগে করতে হবে
    const existingSnapshot = await transaction.get(documentRef);
    const versionSnapshot = await transaction.get(versionRef);

    if (!existingSnapshot.exists) {
      throw createServiceError("Collection not found", 404);
    }

    const now = Date.now();

    const updatedData = {
      ...updates,
      updatedAt: now
    };

    // এরপর writes
    transaction.update(documentRef, updatedData);

    const metadata = incrementTaxonomyVersion(
      transaction,
      versionRef,
      versionSnapshot
    );

    return {
      collection: {
        id,
        ...existingSnapshot.data(),
        ...updatedData
      },
      version: metadata.version,
      updatedAt: metadata.updatedAt
    };
  });
}

export async function deactivateCollection(collectionId) {
  const id = validateCollectionId(collectionId);

  return updateCollection(id, {
    active: false
  });
}

export async function activateCollection(collectionId) {
  const id = validateCollectionId(collectionId);

  return updateCollection(id, {
    active: true
  });
}
