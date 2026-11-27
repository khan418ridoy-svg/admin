
import { db } from "../config/firebase.js";

import {
  PRODUCT_DEFAULTS,
  PRODUCT_SKU,
  PRODUCT_TYPE
} from "./product.constants.js";

import {
  validateCreateProduct,
  validateUpdateProduct
} from "./product.validator.js";

const PRODUCTS_COLLECTION = "products";
const TAXONOMY_COLLECTION = "taxonomyCollections";
const PRODUCT_META_COLLECTION = "productMeta";
const SKU_COUNTER_DOCUMENT = "skuCounter";

function createServiceError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getProductRef(productId) {
  if (
    typeof productId !== "string" ||
    !productId.trim()
  ) {
    throw createServiceError("Invalid product ID");
  }

  return db
    .collection(PRODUCTS_COLLECTION)
    .doc(productId.trim());
}

function getSkuCounterRef() {
  return db
    .collection(PRODUCT_META_COLLECTION)
    .doc(SKU_COUNTER_DOCUMENT);
}

function generateProductSku(number) {
  const formattedNumber = String(number).padStart(
    PRODUCT_SKU.MIN_DIGITS,
    "0"
  );

  return `${PRODUCT_SKU.PREFIX}-${formattedNumber}`;
}

function generateVariantSku(productSku, index) {
  const variantNumber = String(index + 1).padStart(
    2,
    "0"
  );

  return `${productSku}-V${variantNumber}`;
}

function generateSlug(name, productId) {
  const normalized = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const baseSlug = normalized || "product";

  return `${baseSlug}-${productId.slice(0, 6)}`;
}

function assignVariantSkus(
  variants,
  productSku,
  previousVariants = []
) {
  if (!Array.isArray(variants)) {
    return [];
  }

  const previousSkuByVariantId = new Map(
    previousVariants.map((variant) => [
      variant.variantId,
      variant.sku
    ])
  );

  return variants.map((variant, index) => ({
    ...variant,
    sku:
      previousSkuByVariantId.get(variant.variantId) ||
      generateVariantSku(productSku, index)
  }));
}

function validateActiveTaxonomy(
  collectionData,
  categoryId,
  subcategoryId
) {
  if (!collectionData) {
    throw createServiceError(
      "Collection not found",
      404
    );
  }

  if (collectionData.active === false) {
    throw createServiceError(
      "Selected Collection is inactive"
    );
  }

  const categories = Array.isArray(
    collectionData.categories
  )
    ? collectionData.categories
    : [];

  const category = categories.find(
    (item) => item.id === categoryId
  );

  if (!category) {
    throw createServiceError(
      "Category does not belong to selected Collection",
      400
    );
  }

  if (category.active === false) {
    throw createServiceError(
      "Selected Category is inactive"
    );
  }

  if (subcategoryId) {
    const subcategories = Array.isArray(
      category.subcategories
    )
      ? category.subcategories
      : [];

    const subcategory = subcategories.find(
      (item) => item.id === subcategoryId
    );

    if (!subcategory) {
      throw createServiceError(
        "Subcategory does not belong to selected Category",
        400
      );
    }

    if (subcategory.active === false) {
      throw createServiceError(
        "Selected Subcategory is inactive"
      );
    }
  }
}

async function readAndValidateTaxonomy(
  transaction,
  collectionId,
  categoryId,
  subcategoryId
) {
  const collectionRef = db
    .collection(TAXONOMY_COLLECTION)
    .doc(collectionId);

  const collectionSnapshot = await transaction.get(
    collectionRef
  );

  if (!collectionSnapshot.exists) {
    throw createServiceError(
      "Collection not found",
      404
    );
  }

  validateActiveTaxonomy(
    collectionSnapshot.data(),
    categoryId,
    subcategoryId
  );
}

function normalizeProductData(data) {
  return {
    ...data,
    brand:
      data.brand?.trim() ||
      PRODUCT_DEFAULTS.BRAND,
    trackInventory:
      data.trackInventory ??
      PRODUCT_DEFAULTS.TRACK_INVENTORY,
    allowBackorder:
      data.allowBackorder ??
      PRODUCT_DEFAULTS.ALLOW_BACKORDER,
    requiresShipping:
      data.requiresShipping ??
      PRODUCT_DEFAULTS.REQUIRES_SHIPPING,
    featured:
      data.featured ??
      PRODUCT_DEFAULTS.FEATURED,
    status:
      data.status ??
      PRODUCT_DEFAULTS.STATUS
  };
}

/**
 * Create Product
 *
 * Product SKU is generated transactionally.
 * Cost Price is not stored in this document.
 */
export async function createProduct(data) {
  const validatedData = validateCreateProduct(data);
  const normalizedData = normalizeProductData(
    validatedData
  );

  const productRef = db
    .collection(PRODUCTS_COLLECTION)
    .doc();

  const skuCounterRef = getSkuCounterRef();

  return db.runTransaction(async (transaction) => {
    // All reads must happen before writes.
    const skuCounterSnapshot = await transaction.get(
      skuCounterRef
    );

    const currentNumber = skuCounterSnapshot.exists
      ? Number(
          skuCounterSnapshot.data().lastNumber
        ) || 0
      : 0;

    const nextNumber = currentNumber + 1;

    if (!Number.isSafeInteger(nextNumber)) {
      throw createServiceError(
        "Product SKU counter is invalid",
        500
      );
    }

    await readAndValidateTaxonomy(
      transaction,
      normalizedData.collectionId,
      normalizedData.categoryId,
      normalizedData.subcategoryId
    );

    const now = Date.now();
    const sku = generateProductSku(nextNumber);

    const variants = assignVariantSkus(
      normalizedData.variants,
      sku
    );

    const productData = {
      ...normalizedData,
      id: productRef.id,
      sku,
      slug:
        normalizedData.slug ||
        generateSlug(
          normalizedData.name,
          productRef.id
        ),
      variants,
      createdAt: now,
      updatedAt: now
    };

    // Writes start here.
    transaction.create(
      productRef,
      productData
    );

    transaction.set(
      skuCounterRef,
      {
        lastNumber: nextNumber,
        updatedAt: now
      },
      {
        merge: true
      }
    );

    return {
      product: productData
    };
  });
}

/**
 * Get Product by ID
 *
 * Public product data only.
 * Private Cost Price is never included.
 */
export async function getProduct(productId) {
  const productRef = getProductRef(productId);
  const snapshot = await productRef.get();

  if (!snapshot.exists) {
    throw createServiceError(
      "Product not found",
      404
    );
  }

  return {
    id: snapshot.id,
    ...snapshot.data()
  };
}

/**
 * Update Product
 *
 * Product ID and SKU cannot be changed.
 * Variant SKU is preserved for existing Variant IDs.
 */
export async function updateProduct(
  productId,
  data
) {
  const productRef = getProductRef(productId);

  return db.runTransaction(async (transaction) => {
    // First read existing product.
    const productSnapshot = await transaction.get(
      productRef
    );

    if (!productSnapshot.exists) {
      throw createServiceError(
        "Product not found",
        404
      );
    }

    const existingProduct = productSnapshot.data();

    const validationInput = {
      ...data,
      type:
        data.type ??
        existingProduct.type,
      variants:
        data.variants ??
        existingProduct.variants ??
        []
    };

    const validatedData = validateUpdateProduct(
      validationInput
    );

    const normalizedData = normalizeProductData({
      ...existingProduct,
      ...validatedData
    });

    await readAndValidateTaxonomy(
      transaction,
      normalizedData.collectionId,
      normalizedData.categoryId,
      normalizedData.subcategoryId
    );

    const now = Date.now();

    const productSku = existingProduct.sku;

    const variants = assignVariantSkus(
      normalizedData.variants,
      productSku,
      existingProduct.variants || []
    );

    const updatedData = {
      ...validatedData,
      variants,
      updatedAt: now
    };

    if (data.name !== undefined) {
      updatedData.slug =
        data.slug ||
        generateSlug(
          normalizedData.name,
          productSnapshot.id
        );
    } else if (data.slug !== undefined) {
      updatedData.slug = validatedData.slug;
    }

    // SKU and ID remain immutable.
    delete updatedData.id;
    delete updatedData.sku;

    transaction.update(
      productRef,
      updatedData
    );

    return {
      product: {
        id: productSnapshot.id,
        ...existingProduct,
        ...updatedData
      }
    };
  });
}

/**
 * List Products
 *
 * Supports:
 * - status
 * - collectionId
 * - categoryId
 * - limit
 * - cursor
 */
export async function listProducts(options = {}) {
  const {
    status,
    collectionId,
    categoryId,
    limit = 20,
    cursor
  } = options;

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw createServiceError(
      "limit must be between 1 and 100"
    );
  }

  let query = db.collection(
    PRODUCTS_COLLECTION
  );

  if (status) {
    query = query.where(
      "status",
      "==",
      status
    );
  }

  if (collectionId) {
    query = query.where(
      "collectionId",
      "==",
      collectionId
    );
  }

  if (categoryId) {
    query = query.where(
      "categoryId",
      "==",
      categoryId
    );
  }

  query = query
    .orderBy("updatedAt", "desc")
    .limit(limit + 1);

  if (cursor) {
    const cursorRef = getProductRef(cursor);
    const cursorSnapshot = await cursorRef.get();

    if (!cursorSnapshot.exists) {
      throw createServiceError(
        "Invalid pagination cursor",
        400
      );
    }

    query = query.startAfter(
      cursorSnapshot
    );
  }

  const snapshot = await query.get();

  const hasMore = snapshot.docs.length > limit;

  const pageDocs = snapshot.docs.slice(
    0,
    limit
  );

  const products = pageDocs.map(
    (document) => ({
      id: document.id,
      ...document.data()
    })
  );

  return {
    products,
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore
        ? pageDocs[pageDocs.length - 1].id
        : null
    }
  };
}
