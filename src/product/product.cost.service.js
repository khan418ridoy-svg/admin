
import { randomBytes } from "node:crypto";

import { db } from "../config/firebase.js";
import { PRODUCT_COSTS } from "./product.constants.js";

const PRODUCT_COLLECTION = "products";
const PRIVATE_COLLECTION = PRODUCT_COSTS.collection;
const COSTS_FIELD = PRODUCT_COSTS.field;
const MAX_PRODUCTS_PER_BATCH = PRODUCT_COSTS.batchSize;

// Keep a safety margin below Firestore's 1 MiB document limit.
const MAX_DOCUMENT_BYTES = 850 * 1024;

function validateProductId(productId) {
  if (
    typeof productId !== "string" ||
    !productId.trim() ||
    productId.includes("/")
  ) {
    throw new Error("A valid productId is required.");
  }

  return productId.trim();
}

function validateCost(cost, fieldName = "cost") {
  if (
    typeof cost !== "number" ||
    !Number.isFinite(cost) ||
    cost < 0
  ) {
    throw new Error(`${fieldName} must be a valid non-negative number.`);
  }

  return cost;
}

function validateVariantCosts(variants = {}) {
  if (
    !variants ||
    typeof variants !== "object" ||
    Array.isArray(variants)
  ) {
    throw new Error("variants must be an object.");
  }

  const validatedVariants = {};

  for (const [variantId, variantCost] of Object.entries(variants)) {
    if (!variantId.trim() || variantId.includes(".")) {
      throw new Error("Invalid variantId in variant costs.");
    }

    validatedVariants[variantId] = validateCost(
      variantCost,
      `Variant cost (${variantId})`
    );
  }

  return validatedVariants;
}

function validateCostEntry({ cost, variants = {} }) {
  return {
    cost: validateCost(cost),
    variants: validateVariantCosts(variants)
  };
}

function getProductCosts(batchData) {
  const productCosts = batchData?.[COSTS_FIELD];

  if (
    !productCosts ||
    typeof productCosts !== "object" ||
    Array.isArray(productCosts)
  ) {
    return {};
  }

  return productCosts;
}

function getDocumentSizeBytes(data) {
  return Buffer.byteLength(JSON.stringify(data), "utf8");
}

function isBatchAvailable(productCosts, nextData) {
  const productCount = Object.keys(productCosts).length;

  if (productCount >= MAX_PRODUCTS_PER_BATCH) {
    return false;
  }

  return getDocumentSizeBytes(nextData) <= MAX_DOCUMENT_BYTES;
}

function createRandomBatchId() {
  return randomBytes(16).toString("hex");
}

async function readAllCostBatches(transaction = null) {
  const batchCollection = db.collection(PRIVATE_COLLECTION);

  const snapshot = transaction
    ? await transaction.get(batchCollection)
    : await batchCollection.get();

  return snapshot.docs;
}

/**
 * Get the Cost Price entry for one Product.
 *
 * Returns:
 * {
 *   productId,
 *   cost,
 *   variants
 * }
 *
 * Returns null when no cost entry exists.
 */
export async function getProductCost(productId) {
  const validProductId = validateProductId(productId);
  const batchDocs = await readAllCostBatches();

  for (const batchDoc of batchDocs) {
    const productCosts = getProductCosts(batchDoc.data());
    const entry = productCosts[validProductId];

    if (entry) {
      return {
        productId: validProductId,
        cost: entry.cost,
        variants: entry.variants || {}
      };
    }
  }

  return null;
}

/**
 * Save Product and Variant Cost Prices.
 *
 * Cost data is stored only in:
 * private/{randomBatchId}
 *
 * It is never written to products/{productId}.
 */
export async function saveProductCost({
  productId,
  cost,
  variants = {}
}) {
  const validProductId = validateProductId(productId);
  const costEntry = validateCostEntry({ cost, variants });

  const productRef = db
    .collection(PRODUCT_COLLECTION)
    .doc(validProductId);

  const batchCollection = db.collection(PRIVATE_COLLECTION);
  const newBatchRef = batchCollection.doc(createRandomBatchId());

  return db.runTransaction(async (transaction) => {
    // All reads must happen before transaction writes.
    const productSnapshot = await transaction.get(productRef);

    if (!productSnapshot.exists) {
      throw new Error("Product not found.");
    }

    const batchDocs = await readAllCostBatches(transaction);

    let targetBatchRef = null;
    let targetProductCosts = null;

    // First, find an existing batch containing this Product.
    for (const batchDoc of batchDocs) {
      const batchData = batchDoc.data();
      const productCosts = getProductCosts(batchData);

      if (Object.prototype.hasOwnProperty.call(
        productCosts,
        validProductId
      )) {
        const nextProductCosts = {
          ...productCosts,
          [validProductId]: costEntry
        };

        const nextBatchData = {
          ...batchData,
          [COSTS_FIELD]: nextProductCosts,
          updatedAt: new Date()
        };

        if (
          getDocumentSizeBytes(nextBatchData) >
          MAX_DOCUMENT_BYTES
        ) {
          throw new Error(
            "Cost Price batch is too large. Reduce variant cost data."
          );
        }

        targetBatchRef = batchDoc.ref;
        targetProductCosts = nextProductCosts;
        break;
      }
    }

    // If Product is not in a batch, find a batch with available space.
    if (!targetBatchRef) {
      for (const batchDoc of batchDocs) {
        const batchData = batchDoc.data();
        const productCosts = getProductCosts(batchData);

        const nextProductCosts = {
          ...productCosts,
          [validProductId]: costEntry
        };

        const nextBatchData = {
          ...batchData,
          [COSTS_FIELD]: nextProductCosts,
          updatedAt: new Date()
        };

        if (
          isBatchAvailable(productCosts, nextBatchData)
        ) {
          targetBatchRef = batchDoc.ref;
          targetProductCosts = nextProductCosts;
          break;
        }
      }
    }

    // Create a new random batch when existing batches are full.
    if (!targetBatchRef) {
      targetBatchRef = newBatchRef;
      targetProductCosts = {
        [validProductId]: costEntry
      };
    }

    transaction.set(
      targetBatchRef,
      {
        [COSTS_FIELD]: targetProductCosts,
        updatedAt: new Date()
      },
      { merge: true }
    );

    return {
      productId: validProductId,
      saved: true,
      batchId: targetBatchRef.id
    };
  });
}

/**
 * Delete Cost Price data for one Product.
 *
 * This does not delete the Product itself.
 */
export async function deleteProductCost(productId) {
  const validProductId = validateProductId(productId);
  const batchCollection = db.collection(PRIVATE_COLLECTION);

  return db.runTransaction(async (transaction) => {
    const batchDocs = await readAllCostBatches(transaction);

    for (const batchDoc of batchDocs) {
      const batchData = batchDoc.data();
      const productCosts = getProductCosts(batchData);

      if (
        !Object.prototype.hasOwnProperty.call(
          productCosts,
          validProductId
        )
      ) {
        continue;
      }

      const nextProductCosts = { ...productCosts };
      delete nextProductCosts[validProductId];

      if (Object.keys(nextProductCosts).length === 0) {
        transaction.delete(batchDoc.ref);
      } else {
        transaction.set(
          batchDoc.ref,
          {
            [COSTS_FIELD]: nextProductCosts,
            updatedAt: new Date()
          },
          { merge: true }
        );
      }

      return {
        productId: validProductId,
        deleted: true
      };
    }

    return {
      productId: validProductId,
      deleted: false
    };
  });
}

/**
 * Read all Product Cost Price entries.
 *
 * This function is intended for Admin-only use.
 */
export async function getAllProductCosts() {
  const batchDocs = await readAllCostBatches();
  const allProductCosts = {};

  for (const batchDoc of batchDocs) {
    const productCosts = getProductCosts(batchDoc.data());

    Object.assign(allProductCosts, productCosts);
  }

  return allProductCosts;
}
