
import { randomBytes } from "node:crypto";

import { db } from "../config/firebase.js";

import {
  PRODUCT_COSTS,
  PRODUCT_TYPE
} from "./product.constants.js";

// ============================================
// COLLECTIONS
// ============================================

const PRODUCTS_COLLECTION = "products";
const PRIVATE_COLLECTION = PRODUCT_COSTS.COLLECTION;
const INDEX_COLLECTION = "privateCostIndex";

const COSTS_FIELD = PRODUCT_COSTS.FIELD_NAME;
const PRODUCT_COST_FIELD = PRODUCT_COSTS.PRODUCT_COST_FIELD;
const VARIANT_COST_FIELD = PRODUCT_COSTS.VARIANT_COST_FIELD;

// ============================================
// LIMITS
// ============================================

const MAX_PRODUCTS_PER_BATCH = PRODUCT_COSTS.BATCH_SIZE;

// Firestore maximum document size: 1 MiB.
// Keep a safety margin.
const MAX_DOCUMENT_BYTES = 850 * 1024;

// Maximum candidate batches to inspect during allocation.
const MAX_BATCH_CANDIDATES = 20;

// ============================================
// ERRORS
// ============================================

function createCostError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ============================================
// REFERENCES
// ============================================

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

function getProductRef(productId) {
  return db
    .collection(PRODUCTS_COLLECTION)
    .doc(productId);
}

function getBatchCollection() {
  return db.collection(PRIVATE_COLLECTION);
}

function getIndexRef(productId) {
  return db
    .collection(INDEX_COLLECTION)
    .doc(productId);
}

// ============================================
// VALIDATION
// ============================================

function validateCost(value, fieldName = "Cost Price") {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw createCostError(
      `${fieldName} must be a valid non-negative number.`
    );
  }

  return Math.round(value * 100) / 100;
}

function validateVariantCostInput(variants) {
  if (
    variants === undefined ||
    variants === null
  ) {
    return {};
  }

  if (
    typeof variants !== "object" ||
    Array.isArray(variants)
  ) {
    throw createCostError(
      "variants must be an object."
    );
  }

  const result = {};

  for (const [variantId, value] of Object.entries(variants)) {
    if (
      !variantId.trim() ||
      variantId.length > 100 ||
      [
        "__proto__",
        "constructor",
        "prototype"
      ].includes(variantId)
    ) {
      throw createCostError(
        "Invalid variantId in variant costs."
      );
    }

    result[variantId] = validateCost(
      value,
      `Variant Cost (${variantId})`
    );
  }

  return result;
}

function validateProductCostInput({
  cost,
  variants
}) {
  return {
    [PRODUCT_COST_FIELD]: validateCost(cost),
    [VARIANT_COST_FIELD]: validateVariantCostInput(
      variants
    )
  };
}

/**
 * Ensure supplied Variant IDs belong to this Product.
 */
function validateProductVariants(product, variantCosts) {
  const productType = product.type;

  if (productType === PRODUCT_TYPE.SIMPLE) {
    if (Object.keys(variantCosts).length > 0) {
      throw createCostError(
        "Simple products cannot have Variant Cost."
      );
    }

    return;
  }

  if (productType !== PRODUCT_TYPE.VARIABLE) {
    throw createCostError(
      "Product has an invalid type.",
      500
    );
  }

  const productVariants = Array.isArray(product.variants)
    ? product.variants
    : [];

  const validVariantIds = new Set(
    productVariants.map(variant => variant.variantId)
  );

  for (const variantId of Object.keys(variantCosts)) {
    if (!validVariantIds.has(variantId)) {
      throw createCostError(
        `Variant "${variantId}" does not belong to this Product.`
      );
    }
  }
}

// ============================================
// BATCH HELPERS
// ============================================

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

function getProductCount(productCosts) {
  return Object.keys(productCosts).length;
}

function getDocumentSizeBytes(data) {
  return Buffer.byteLength(
    JSON.stringify(data),
    "utf8"
  );
}

function createRandomBatchId() {
  return randomBytes(16).toString("hex");
}

function createBatchData(productCosts) {
  const now = new Date();

  const data = {
    [COSTS_FIELD]: productCosts,
    productCount: getProductCount(productCosts),
    updatedAt: now
  };

  data.sizeBytes = getDocumentSizeBytes(data);

  return data;
}

function hasBatchCapacity(batchData, nextProductCosts) {
  const productCount = getProductCount(nextProductCosts);

  if (productCount > MAX_PRODUCTS_PER_BATCH) {
    return false;
  }

  const nextBatchData = createBatchData(
    nextProductCosts
  );

  return (
    nextBatchData.sizeBytes <= MAX_DOCUMENT_BYTES
  );
}

// ============================================
// INDEX LOOKUP
// ============================================

/**
 * Index structure:
 *
 * privateCostIndex/{productId}
 *
 * {
 *   batchId: "randomBatchId",
 *   updatedAt: Date
 * }
 *
 * This avoids scanning every private batch.
 */

async function getIndexedBatch(
  transaction,
  productId
) {
  const indexRef = getIndexRef(productId);

  const indexSnapshot = await transaction.get(
    indexRef
  );

  if (!indexSnapshot.exists) {
    return {
      indexRef,
      indexSnapshot,
      batchRef: null,
      batchSnapshot: null
    };
  }

  const batchId = indexSnapshot.data().batchId;

  if (
    typeof batchId !== "string" ||
    !batchId.trim()
  ) {
    return {
      indexRef,
      indexSnapshot,
      batchRef: null,
      batchSnapshot: null
    };
  }

  const batchRef = getBatchCollection().doc(batchId);

  const batchSnapshot = await transaction.get(
    batchRef
  );

  return {
    indexRef,
    indexSnapshot,
    batchRef,
    batchSnapshot
  };
}

// ============================================
// BATCH ALLOCATION
// ============================================

/**
 * Find an existing batch with available capacity.
 *
 * Uses productCount query instead of reading
 * the entire private collection.
 */
async function findAvailableBatch(
  transaction,
  productId,
  excludedBatchId = null
) {
  const query = getBatchCollection()
    .where(
      "productCount",
      "<",
      MAX_PRODUCTS_PER_BATCH
    )
    .orderBy("productCount", "asc")
    .limit(MAX_BATCH_CANDIDATES);

  const snapshot = await transaction.get(query);

  for (const batchDoc of snapshot.docs) {
    if (batchDoc.id === excludedBatchId) {
      continue;
    }

    const batchData = batchDoc.data();
    const productCosts = getProductCosts(batchData);

    // Do not create duplicate Product entries.
    if (
      Object.prototype.hasOwnProperty.call(
        productCosts,
        productId
      )
    ) {
      continue;
    }

    const nextProductCosts = {
      ...productCosts,
      [productId]: null
    };

    // The actual entry will be added by the caller.
    // Here we only check whether the batch has room.
    if (
      getProductCount(nextProductCosts) <=
      MAX_PRODUCTS_PER_BATCH
    ) {
      return {
        ref: batchDoc.ref,
        data: batchData,
        productCosts
      };
    }
  }

  return null;
}

// ============================================
// GET PRODUCT COST
// ============================================

/**
 * Read one Product's private Cost Price.
 *
 * Reads:
 * 1. privateCostIndex/{productId}
 * 2. private/{batchId}
 *
 * No full collection scan.
 */
export async function getProductCost(productId) {
  const validProductId = validateProductId(productId);

  const indexRef = getIndexRef(validProductId);

  const indexSnapshot = await indexRef.get();

  if (!indexSnapshot.exists) {
    return null;
  }

  const batchId = indexSnapshot.data().batchId;

  if (
    typeof batchId !== "string" ||
    !batchId.trim()
  ) {
    throw createCostError(
      "Product Cost index is invalid.",
      500
    );
  }

  const batchSnapshot = await getBatchCollection()
    .doc(batchId)
    .get();

  if (!batchSnapshot.exists) {
    throw createCostError(
      "Product Cost batch is missing.",
      500
    );
  }

  const productCosts = getProductCosts(
    batchSnapshot.data()
  );

  if (
    !Object.prototype.hasOwnProperty.call(
      productCosts,
      validProductId
    )
  ) {
    throw createCostError(
      "Product Cost index is inconsistent.",
      500
    );
  }

  const entry = productCosts[validProductId];

  return {
    productId: validProductId,
    cost: entry[PRODUCT_COST_FIELD],
    variants: entry[VARIANT_COST_FIELD] || {}
  };
}

// ============================================
// SAVE PRODUCT COST
// ============================================

/**
 * Save Product Cost and Variant Costs.
 *
 * Firestore:
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
 *   productCount: 1,
 *   sizeBytes: 300,
 *   updatedAt: Date
 * }
 *
 * Index:
 *
 * privateCostIndex/{productId}
 *
 * {
 *   batchId: "randomBatchId",
 *   updatedAt: Date
 * }
 */
export async function saveProductCost({
  productId,
  cost,
  variants = {}
}) {
  const validProductId = validateProductId(productId);

  const costEntry = validateProductCostInput({
    cost,
    variants
  });

  const productRef = getProductRef(validProductId);
  const indexRef = getIndexRef(validProductId);
  const batchCollection = getBatchCollection();

  return db.runTransaction(async transaction => {
    // ========================================
    // READ PHASE
    // ========================================

    const productSnapshot = await transaction.get(
      productRef
    );

    if (!productSnapshot.exists) {
      throw createCostError(
        "Product not found.",
        404
      );
    }

    const productData = productSnapshot.data();

    validateProductVariants(
      productData,
      costEntry[VARIANT_COST_FIELD]
    );

    const indexed = await getIndexedBatch(
      transaction,
      validProductId
    );

    let targetBatchRef = null;
    let targetBatchData = null;

    // ========================================
    // UPDATE EXISTING BATCH
    // ========================================

    if (
      indexed.batchSnapshot?.exists
    ) {
      const batchData = indexed.batchSnapshot.data();
      const productCosts = getProductCosts(batchData);

      if (
        Object.prototype.hasOwnProperty.call(
          productCosts,
          validProductId
        )
      ) {
        const nextProductCosts = {
          ...productCosts,
          [validProductId]: costEntry
        };

        targetBatchData = createBatchData(
          nextProductCosts
        );

        if (
          targetBatchData.sizeBytes >
          MAX_DOCUMENT_BYTES
        ) {
          throw createCostError(
            "Cost Price batch exceeds the allowed document size."
          );
        }

        targetBatchRef = indexed.batchRef;
      }
    }

    // ========================================
    // FIND AVAILABLE BATCH
    // ========================================

    if (!targetBatchRef) {
      const availableBatch = await findAvailableBatch(
        transaction,
        validProductId,
        indexed.batchRef?.id || null
      );

      if (availableBatch) {
        const nextProductCosts = {
          ...availableBatch.productCosts,
          [validProductId]: costEntry
        };

        if (
          hasBatchCapacity(
            availableBatch.data,
            nextProductCosts
          )
        ) {
          targetBatchRef = availableBatch.ref;

          targetBatchData = createBatchData(
            nextProductCosts
          );
        }
      }
    }

    // ========================================
    // CREATE NEW BATCH
    // ========================================

    if (!targetBatchRef) {
      targetBatchRef = batchCollection.doc(
        createRandomBatchId()
      );

      targetBatchData = createBatchData({
        [validProductId]: costEntry
      });

      if (
        targetBatchData.sizeBytes >
        MAX_DOCUMENT_BYTES
      ) {
        throw createCostError(
          "Cost Price data exceeds the allowed document size."
        );
      }

      transaction.create(
        targetBatchRef,
        targetBatchData
      );
    } else {
      transaction.set(
        targetBatchRef,
        targetBatchData
      );
    }

    // ========================================
    // WRITE INDEX
    // ========================================

    transaction.set(indexRef, {
      batchId: targetBatchRef.id,
      updatedAt: new Date()
    });

    return {
      productId: validProductId,
      saved: true,
      batchId: targetBatchRef.id
    };
  });
}

// ============================================
// DELETE PRODUCT COST
// ============================================

/**
 * Delete Product Cost and its index.
 *
 * Does not delete the Product document.
 */
export async function deleteProductCost(productId) {
  const validProductId = validateProductId(productId);

  const indexRef = getIndexRef(validProductId);

  return db.runTransaction(async transaction => {
    // ========================================
    // READ PHASE
    // ========================================

    const indexSnapshot = await transaction.get(
      indexRef
    );

    if (!indexSnapshot.exists) {
      return {
        productId: validProductId,
        deleted: false
      };
    }

    const batchId = indexSnapshot.data().batchId;

    if (
      typeof batchId !== "string" ||
      !batchId.trim()
    ) {
      transaction.delete(indexRef);

      return {
        productId: validProductId,
        deleted: false
      };
    }

    const batchRef = getBatchCollection().doc(batchId);

    const batchSnapshot = await transaction.get(
      batchRef
    );

    // ========================================
    // WRITE PHASE
    // ========================================

    if (batchSnapshot.exists) {
      const batchData = batchSnapshot.data();

      const productCosts = getProductCosts(
        batchData
      );

      if (
        Object.prototype.hasOwnProperty.call(
          productCosts,
          validProductId
        )
      ) {
        const nextProductCosts = {
          ...productCosts
        };

        delete nextProductCosts[validProductId];

        if (
          getProductCount(nextProductCosts) === 0
        ) {
          transaction.delete(batchRef);
        } else {
          transaction.set(
            batchRef,
            createBatchData(nextProductCosts)
          );
        }
      }
    }

    transaction.delete(indexRef);

    return {
      productId: validProductId,
      deleted: true
    };
  });
}

// ============================================
// GET ALL PRODUCT COSTS
// ============================================

/**
 * Admin-only internal use.
 *
 * This function intentionally reads all batches.
 * Do not expose it through a public Product API.
 */
export async function getAllProductCosts() {
  const snapshot = await getBatchCollection().get();

  const result = {};

  for (const batchDoc of snapshot.docs) {
    const productCosts = getProductCosts(
      batchDoc.data()
    );

    Object.assign(result, productCosts);
  }

  return result;
}
