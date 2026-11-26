
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

async function incrementTaxonomyVersion(transaction, versionRef) {
  const versionSnapshot = await transaction.get(versionRef);

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

/**
 * Get taxonomy data.
 *
 * If clientVersion matches the current version,
 * taxonomyCollections will not be read.
 */
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
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    notModified: false,
    version: currentVersion,
    updatedAt: metadata.updatedAt ?? null,
    collections
  };
}

/**
 * Get one collection.
 */
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

/**
 * Create a new collection.
 */
export async function createCollection(data) {
  const collection = validateCollection(data);

  const documentRef = getCollectionRef(collection.id);
  const versionRef = getVersionRef();

  return db.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(documentRef);

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

    transaction.create(documentRef, documentData);

    const metadata = await incrementTaxonomyVersion(
      transaction,
      versionRef
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

/**
 * Update an existing collection.
 *
 * Collection document ID cannot be changed.
 */
export async function updateCollection(collectionId, data) {
  const id = validateCollectionId(collectionId);
  const updates = validateCollectionUpdate(data);

  const documentRef = getCollectionRef(id);
  const versionRef = getVersionRef();

  return db.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(documentRef);

    if (!existingSnapshot.exists) {
      throw createServiceError("Collection not found", 404);
    }

    const now = Date.now();

    const updatedData = {
      ...updates,
      updatedAt: now
    };

    transaction.update(documentRef, updatedData);

    const metadata = await incrementTaxonomyVersion(
      transaction,
      versionRef
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

/**
 * Deactivate a collection instead of deleting it.
 */
export async function deactivateCollection(collectionId) {
  const id = validateCollectionId(collectionId);

  return updateCollection(id, {
    active: false
  });
}

/**
 * Activate a previously deactivated collection.
 */
export async function activateCollection(collectionId) {
  const id = validateCollectionId(collectionId);

  return updateCollection(id, {
    active: true
  });
}
