
/**
 * Product Catalog Constants
 *
 * Product Type: Simple + Variable
 * SKU: Auto-generated
 * Image Storage: Cloudinary
 * Cost Price: Private batched Firestore documents
 */

export const PRODUCT_TYPE = Object.freeze({
  SIMPLE: "simple",
  VARIABLE: "variable"
});

export const PRODUCT_STATUS = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  INACTIVE: "inactive"
});

export const PRODUCT_DEFAULTS = Object.freeze({
  TYPE: PRODUCT_TYPE.SIMPLE,
  STATUS: PRODUCT_STATUS.DRAFT,
  BRAND: "Nishat Fashion",
  FEATURED: false,
  TRACK_INVENTORY: true,
  ALLOW_BACKORDER: false,
  REQUIRES_SHIPPING: true
});

/**
 * Product SKU
 *
 * Example:
 * NF-000001
 * NF-000002
 */
export const PRODUCT_SKU = Object.freeze({
  PREFIX: "NF",
  START_NUMBER: 1,
  MIN_DIGITS: 6
});

/**
 * Product Images
 *
 * All product images will be stored in Cloudinary.
 * Firestore will store only image metadata and URLs.
 */
export const PRODUCT_IMAGES = Object.freeze({
  STORAGE_PROVIDER: "cloudinary",
  MAX_IMAGES: 20,
  MIN_IMAGES: 1,
  ALLOWED_FORMATS: Object.freeze([
    "jpg",
    "jpeg",
    "png",
    "webp"
  ])
});

/**
 * Product Variants
 *
 * Each variant must have a permanent unique variantId.
 * Cost Price will be linked using variantId.
 */
export const PRODUCT_VARIANTS = Object.freeze({
  MAX_VARIANTS: 200,
  ATTRIBUTES: Object.freeze([
    "color",
    "size"
  ])
});

/**
 * Private Cost Price Batch
 *
 * One Firestore document can store cost prices
 * for up to 300 products.
 *
 * Example productCosts:
 *
 * {
 *   productId_001: {
 *     cost: 300,
 *     variants: {
 *       variantId_red_m: 200,
 *       variantId_blue_l: 250
 *     }
 *   }
 * }
 */
export const PRODUCT_COSTS = Object.freeze({
  COLLECTION: "private",
  BATCH_SIZE: 300,
  FIELD_NAME: "productCosts",
  PRODUCT_COST_FIELD: "cost",
  VARIANT_COST_FIELD: "variants"
});

/**
 * Product Text Fields
 *
 * These fields can be generated using Gemini.
 */
export const PRODUCT_TEXT_FIELDS = Object.freeze({
  SHORT_DESCRIPTION: "shortDescription",
  FULL_DESCRIPTION: "fullDescription",
  TAGS: "tags"
});

/**
 * Product Limits
 */
export const PRODUCT_LIMITS = Object.freeze({
  NAME_MAX_LENGTH: 200,
  SLUG_MAX_LENGTH: 200,
  SHORT_DESCRIPTION_MAX_LENGTH: 500,
  FULL_DESCRIPTION_MAX_LENGTH: 10000,
  MAX_TAGS: 30,
  TAG_MAX_LENGTH: 50
});

/**
 * Product Taxonomy
 *
 * These IDs must reference existing taxonomy records.
 */
export const PRODUCT_TAXONOMY_FIELDS = Object.freeze({
  COLLECTION_ID: "collectionId",
  CATEGORY_ID: "categoryId",
  SUBCATEGORY_ID: "subcategoryId"
});
