
import { randomBytes } from "node:crypto";

import { db } from "../config/firebase.js";
import { PRODUCT_COSTS } from "./product.constants.js";

const PRODUCTS_COLLECTION = "products";
const PRIVATE_COLLECTION = PRODUCT_COSTS.COLLECTION;
const COSTS_FIELD = PRODUCT_COSTS.FIELD_NAME;
const MAX_PRODUCTS_PER_BATCH = PRODUCT_COSTS.BATCH_SIZE;

// Firestore limit is 1 MiB.
// Keep a safety margin for document metadata and field overhead.
const MAX_DOCUMENT_BYTES = 850 * 1024;

function createCostError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validateProductId(productId) {
  if (
    typeof productId !== "string" ||
    !productId.trim() ||
    productId.includes("/")
  ) {
    throw createCostError("A valid productId is required.");
  }

  return productId.trim();
}

function validateCost(cost, fieldName = "Cost Price") {
  if (
    typeof cost !== "number" ||
    !Number.isFinite(cost) ||
    cost < 0
  ) {
    throw createCostError(
      `${fieldName} must be a valid non-negative number.`
    );
  }

  return cost;
}

function validateVariantCosts(variants = {}) {
  if (
    !variants ||
    typeof variants !== "object" ||
    Array.isArray(variants)
  ) {
    throw createCostError("variants must be an object.");
  }

  const validatedVariants = {};

  for (const [variantId, variantCost] of Object.entries(variants)) {
    if (
      !variantId.trim() ||
      variantId.includes(".") ||
      variantId.includes("/") ||
      ["__proto__", "constructor", "prototype"].includes(variantId)
    ) {
      throw createCostError("Invalid variantId in variant costs.");
    }

    validatedVariants[variantId] = validateCost(
      variantCost,
      `Variant Cost (${variantId})`
    );
  }

  return validatedVariants;
}

function validateCostEntry({ cost, variants = {} }) {
  return {
    [PRODUCT_COSTS.PRODUCT_COST_FIELD]: validateCost(cost),
    [PRODUCT_COSTS.VARIANT_COST_FIELD]: validateVariantCosts(variants)
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

function createRandomBatchId() {
  return randomBytes(16).toString("hex");
}

function isBatchAvailable(productCosts, nextBatchData) {
  const productCount = Object.keys(productCosts).length;

  if (productCount >= MAX_PRODUCTS_PER_BATCH) {
    return false;
  }

  return getDocumentSizeBytes(nextBatchData) <= MAX_DOCUMENT_BYTES;
}

async function readAllCostBatches(transaction = null) {
  const batchCollection = db.collection(PRIVATE_COLLECTION);

  const snapshot = transaction
    ? await transaction.get(batchCollection)
    : await batchCollection.get();

  return snapshot.docs;
}

/**
 * Get Cost Price for one Product.
 *
 * Returns:
 * {
 *   productId,
 *   cost,
 *   variants
 * }
 *
 * Returns null if no Cost Price exists.
 */
export async function getProductCost(productId) {
  const validProductId = validateProductId(productId);
  const batchDocs = await readAllCostBatches();

  for (const batchDoc of batchDocs) {
    const productCosts = getProductCosts(batchDoc.data());

    if (
      !Object.prototype.hasOwnProperty.call(
        productCosts,
        validProductId
      )
    ) {
      continue;
    }

    const entry = productCosts[validProductId];

    return {
      productId: validProductId,
      cost: entry[PRODUCT_COSTS.PRODUCT_COST_FIELD],
      variants: entry[PRODUCT_COSTS.VARIANT_COST_FIELD] || {}
    };
  }

  return null;
}

/**
 * Save Product and Variant Cost Prices.
 *
 * Firestore structure:
 *
 * private/{randomBatchId}
 *
 * {
 *   productCosts: {
 *     productId: {
 *       cost: 300,
 *       variants: {
 *         variantId: 200
 *       }
 *     }
 *   },
 *   updatedAt: Date
 * }
 *
 * Maximum 300 Products per batch.
 *
 * Cost Price is never written to products/{productId}.
 */
export async function saveProductCost({
  productId,
  cost,
  variants = {}
}) {
  const validProductId = validateProductId(productId);
  const costEntry = validateCostEntry({ cost, variants });

  const productRef = db
    .collection(PRODUCTS_COLLECTION)
    .doc(validProductId);

  const batchCollection = db.collection(PRIVATE_COLLECTION);

  return db.runTransaction(async (transaction) => {
    // All transaction reads must happen before writes.
    const productSnapshot = await transaction.get(productRef);

    if (!productSnapshot.exists) {
      throw createCostError("Product not found.", 404);
    }

    const batchDocs = await readAllCostBatches(transaction);

    let targetBatchRef = null;
    let targetBatchData = null;

    // 1. Find the batch that already contains this Product.
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

      const nextProductCosts = {
        ...productCosts,
        [validProductId]: costEntry
      };

      const nextBatchData = {
        ...batchData,
        [COSTS_FIELD]: nextProductCosts,
        updatedAt: new Date()
      };

      if (getDocumentSizeBytes(nextBatchData) > MAX_DOCUMENT_BYTES) {
        throw createCostError(
          "Cost Price batch is too large. Reduce variant cost data."
        );
      }

      targetBatchRef = batchDoc.ref;
      targetBatchData = nextBatchData;
      break;
    }

    // 2. If Product is new, find a batch with available space.
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

        if (isBatchAvailable(productCosts, nextBatchData)) {
          targetBatchRef = batchDoc.ref;
          targetBatchData = nextBatchData;
          break;
        }
      }
    }

    // 3. If every existing batch is full, create a new random batch.
    if (!targetBatchRef) {
      targetBatchRef = batchCollection.doc(createRandomBatchId());

      targetBatchData = {
        [COSTS_FIELD]: {
          [validProductId]: costEntry
        },
        updatedAt: new Date()
      };

      if (getDocumentSizeBytes(targetBatchData) > MAX_DOCUMENT_BYTES) {
        throw createCostError(
          "Cost Price data exceeds the allowed document size."
        );
      }

      // New batch: create prevents accidental overwrite on ID collision.
      transaction.create(targetBatchRef, targetBatchData);
    } else {
      // Replace the complete batch document.
      // Do not use merge:true because removed nested Variant IDs
      // must not remain in Firestore.
      transaction.set(targetBatchRef, targetBatchData);
    }

    return {
      productId: validProductId,
      saved: true,
      batchId: targetBatchRef.id
    };
  });
}

/**
 * Delete Cost Price for one Product.
 *
 * Does not delete the Product document.
 */
export async function deleteProductCost(productId) {
  const validProductId = validateProductId(productId);

  return db.runTransaction(async (transaction) => {
    const batchDocs = await readAllCostBatches(transaction);

    // All reads are complete before the first write.
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
        // Replace the full document to avoid stale nested fields.
        transaction.set(batchDoc.ref, {
          ...batchData,
          [COSTS_FIELD]: nextProductCosts,
          updatedAt: new Date()
        });
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
 * Read all Product Cost Prices.
 *
 * Admin-only use.
 *
 * IMPORTANT:
 * Never expose this result through public Product APIs.
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
