
import {
  PRODUCT_TYPE,
  PRODUCT_STATUS,
  PRODUCT_IMAGES,
  PRODUCT_VARIANTS,
  PRODUCT_LIMITS
} from "./product.constants.js";

const ALLOWED_PRODUCT_FIELDS = new Set([
  "name",
  "slug",
  "shortDescription",
  "fullDescription",
  "tags",
  "brand",
  "type",
  "collectionId",
  "categoryId",
  "subcategoryId",
  "images",
  "sellingPrice",
  "compareAtPrice",
  "barcode",
  "variants",
  "trackInventory",
  "stockQuantity",
  "lowStockAlert",
  "allowBackorder",
  "requiresShipping",
  "weight",
  "length",
  "width",
  "height",
  "seoTitle",
  "seoDescription",
  "seoKeywords",
  "status",
  "featured"
]);

const ALLOWED_VARIANT_FIELDS = new Set([
  "variantId",
  "name",
  "attributes",
  "sku",
  "barcode",
  "sellingPrice",
  "compareAtPrice",
  "image",
  "stockQuantity",
  "active"
]);

const ALLOWED_IMAGE_FIELDS = new Set([
  "url",
  "publicId",
  "alt",
  "color",
  "isMain"
]);

const ALLOWED_VARIANT_ATTRIBUTES = new Set(
  PRODUCT_VARIANTS.ATTRIBUTES
);

const CLOUDINARY_HOSTS = new Set([
  "res.cloudinary.com"
]);

function createValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function rejectUnknownFields(data, allowedFields, label) {
  for (const field of Object.keys(data)) {
    if (!allowedFields.has(field)) {
      throw createValidationError(
        `${label}: Unsupported field "${field}"`
      );
    }
  }
}

function requireString(value, field, maxLength) {
  if (typeof value !== "string") {
    throw createValidationError(
      `${field} must be a string`
    );
  }

  const normalized = value.trim();

  if (!normalized) {
    throw createValidationError(
      `${field} is required`
    );
  }

  if (normalized.length > maxLength) {
    throw createValidationError(
      `${field} cannot exceed ${maxLength} characters`
    );
  }

  return normalized;
}

function optionalString(value, field, maxLength) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw createValidationError(
      `${field} must be a string`
    );
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw createValidationError(
      `${field} cannot exceed ${maxLength} characters`
    );
  }

  return normalized;
}

function validateId(value, field) {
  return requireString(value, field, 100);
}

function validateBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw createValidationError(
      `${field} must be a boolean`
    );
  }

  return value;
}

function validateMoney(value, field, required = false) {
  if (value === undefined || value === null) {
    if (required) {
      throw createValidationError(
        `${field} is required`
      );
    }

    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw createValidationError(
      `${field} must be a valid non-negative number`
    );
  }

  return Math.round(value * 100) / 100;
}

function validateNonNegativeInteger(
  value,
  field,
  required = false
) {
  if (value === undefined || value === null) {
    if (required) {
      throw createValidationError(
        `${field} is required`
      );
    }

    return undefined;
  }

  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw createValidationError(
      `${field} must be a non-negative integer`
    );
  }

  return value;
}

function validateCloudinaryUrl(value, field) {
  const url = requireString(value, field, 2048);

  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    throw createValidationError(
      `${field} must be a valid URL`
    );
  }

  if (
    parsed.protocol !== "https:" ||
    !CLOUDINARY_HOSTS.has(parsed.hostname)
  ) {
    throw createValidationError(
      `${field} must be a valid Cloudinary HTTPS URL`
    );
  }

  if (!parsed.pathname.includes("/image/upload/")) {
    throw createValidationError(
      `${field} must be a Cloudinary image URL`
    );
  }

  return url;
}

function validateImage(image, index) {
  if (!isPlainObject(image)) {
    throw createValidationError(
      `images[${index}] must be an object`
    );
  }

  rejectUnknownFields(
    image,
    ALLOWED_IMAGE_FIELDS,
    `images[${index}]`
  );

  const result = {
    url: validateCloudinaryUrl(
      image.url,
      `images[${index}].url`
    ),
    publicId: requireString(
      image.publicId,
      `images[${index}].publicId`,
      500
    ),
    alt: optionalString(
      image.alt,
      `images[${index}].alt`,
      300
    ),
    isMain: image.isMain === true
  };

  if (image.color !== undefined) {
    result.color = optionalString(
      image.color,
      `images[${index}].color`,
      100
    );
  }

  return result;
}

function validateImages(images, required = true) {
  if (images === undefined) {
    if (required) {
      throw createValidationError(
        "images is required"
      );
    }

    return undefined;
  }

  if (!Array.isArray(images)) {
    throw createValidationError(
      "images must be an array"
    );
  }

  if (images.length > PRODUCT_IMAGES.MAX_IMAGES) {
    throw createValidationError(
      `Maximum ${PRODUCT_IMAGES.MAX_IMAGES} images are allowed`
    );
  }

  if (
    required &&
    images.length < PRODUCT_IMAGES.MIN_IMAGES
  ) {
    throw createValidationError(
      "At least one product image is required"
    );
  }

  const validatedImages = images.map(
    validateImage
  );

  const mainImages = validatedImages.filter(
    image => image.isMain
  );

  if (
    validatedImages.length > 0 &&
    mainImages.length !== 1
  ) {
    throw createValidationError(
      "Exactly one image must be marked as main"
    );
  }

  return validatedImages;
}

function validateTags(tags) {
  if (tags === undefined || tags === null) {
    return [];
  }

  if (!Array.isArray(tags)) {
    throw createValidationError(
      "tags must be an array"
    );
  }

  if (tags.length > PRODUCT_LIMITS.MAX_TAGS) {
    throw createValidationError(
      `Maximum ${PRODUCT_LIMITS.MAX_TAGS} tags are allowed`
    );
  }

  const normalizedTags = tags.map(
    (tag, index) =>
      requireString(
        tag,
        `tags[${index}]`,
        PRODUCT_LIMITS.TAG_MAX_LENGTH
      )
  );

  return [
    ...new Set(
      normalizedTags.map(tag => tag.toLowerCase())
    )
  ];
}

function validateVariantAttributes(attributes) {
  if (!isPlainObject(attributes)) {
    throw createValidationError(
      "Variant attributes must be an object"
    );
  }

  const result = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (!ALLOWED_VARIANT_ATTRIBUTES.has(key)) {
      throw createValidationError(
        `Unsupported variant attribute "${key}"`
      );
    }

    result[key] = requireString(
      value,
      `variants.attributes.${key}`,
      100
    );
  }

  if (Object.keys(result).length === 0) {
    throw createValidationError(
      "Variant must have at least one attribute"
    );
  }

  return result;
}

function validateVariant(variant, index) {
  if (!isPlainObject(variant)) {
    throw createValidationError(
      `variants[${index}] must be an object`
    );
  }

  rejectUnknownFields(
    variant,
    ALLOWED_VARIANT_FIELDS,
    `variants[${index}]`
  );

  const result = {
    variantId: validateId(
      variant.variantId,
      `variants[${index}].variantId`
    ),
    name: requireString(
      variant.name,
      `variants[${index}].name`,
      150
    ),
    attributes: validateVariantAttributes(
      variant.attributes
    ),
    sellingPrice: validateMoney(
      variant.sellingPrice,
      `variants[${index}].sellingPrice`,
      true
    ),
    active:
      variant.active === undefined
        ? true
        : validateBoolean(
            variant.active,
            `variants[${index}].active`
          )
  };

  if (variant.barcode !== undefined) {
    result.barcode = optionalString(
      variant.barcode,
      `variants[${index}].barcode`,
      100
    );
  }

  if (variant.compareAtPrice !== undefined) {
    result.compareAtPrice = validateMoney(
      variant.compareAtPrice,
      `variants[${index}].compareAtPrice`
    );
  }

  if (variant.image !== undefined) {
    result.image = validateCloudinaryUrl(
      variant.image,
      `variants[${index}].image`
    );
  }

  if (variant.stockQuantity !== undefined) {
    result.stockQuantity =
      validateNonNegativeInteger(
        variant.stockQuantity,
        `variants[${index}].stockQuantity`
      );
  }

  /*
   * SKU is generated by backend.
   * Client-supplied SKU is not saved.
   */

  return result;
}

function validateVariants(variants, productType) {
  if (productType === PRODUCT_TYPE.SIMPLE) {
    if (
      variants !== undefined &&
      (!Array.isArray(variants) || variants.length > 0)
    ) {
      throw createValidationError(
        "Simple product cannot contain variants"
      );
    }

    return [];
  }

  if (productType !== PRODUCT_TYPE.VARIABLE) {
    throw createValidationError(
      "Invalid product type"
    );
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    throw createValidationError(
      "Variable product must contain at least one variant"
    );
  }

  if (variants.length > PRODUCT_VARIANTS.MAX_VARIANTS) {
    throw createValidationError(
      `Maximum ${PRODUCT_VARIANTS.MAX_VARIANTS} variants are allowed`
    );
  }

  const validatedVariants = variants.map(
    validateVariant
  );

  const variantIds = validatedVariants.map(
    variant => variant.variantId
  );

  if (new Set(variantIds).size !== variantIds.length) {
    throw createValidationError(
      "Variant IDs must be unique"
    );
  }

  return validatedVariants;
}

function validateProductData(data, options = {}) {
  const {
    partial = false
  } = options;

  if (!isPlainObject(data)) {
    throw createValidationError(
      "Product data must be an object"
    );
  }

  rejectUnknownFields(
    data,
    ALLOWED_PRODUCT_FIELDS,
    "Product"
  );

  /*
   * Cost Price must never be accepted
   * inside the public product document.
   */
  const forbiddenFields = [
    "cost",
    "costPrice",
    "productCosts",
    "purchasePrice",
    "variantCost"
  ];

  for (const field of forbiddenFields) {
    if (Object.hasOwn(data, field)) {
      throw createValidationError(
        `Field "${field}" is private and cannot be stored in product data`
      );
    }
  }

  if (
    !partial &&
    (
      !data.name ||
      !data.type ||
      !data.collectionId ||
      !data.categoryId
    )
  ) {
    throw createValidationError(
      "Name, type, collectionId and categoryId are required"
    );
  }

  const result = {};

  if (data.name !== undefined) {
    result.name = requireString(
      data.name,
      "name",
      PRODUCT_LIMITS.NAME_MAX_LENGTH
    );
  }

  if (data.slug !== undefined) {
    result.slug = requireString(
      data.slug,
      "slug",
      PRODUCT_LIMITS.SLUG_MAX_LENGTH
    ).toLowerCase();
  }

  if (data.shortDescription !== undefined) {
    result.shortDescription = optionalString(
      data.shortDescription,
      "shortDescription",
      PRODUCT_LIMITS.SHORT_DESCRIPTION_MAX_LENGTH
    );
  }

  if (data.fullDescription !== undefined) {
    result.fullDescription = optionalString(
      data.fullDescription,
      "fullDescription",
      PRODUCT_LIMITS.FULL_DESCRIPTION_MAX_LENGTH
    );
  }

  if (data.tags !== undefined) {
    result.tags = validateTags(data.tags);
  }

  if (data.brand !== undefined) {
    result.brand = optionalString(
      data.brand,
      "brand",
      100
    );
  }

  if (data.type !== undefined) {
    if (
      !Object.values(PRODUCT_TYPE).includes(data.type)
    ) {
      throw createValidationError(
        "type must be simple or variable"
      );
    }

    result.type = data.type;
  }

  for (const field of [
    "collectionId",
    "categoryId"
  ]) {
    if (data[field] !== undefined) {
      result[field] = validateId(
        data[field],
        field
      );
    }
  }

  if (data.subcategoryId !== undefined) {
    result.subcategoryId = validateId(
      data.subcategoryId,
      "subcategoryId"
    );
  }

  if (data.images !== undefined) {
    result.images = validateImages(
      data.images,
      !partial
    );
  } else if (!partial) {
    throw createValidationError(
      "images is required"
    );
  }

  if (data.sellingPrice !== undefined) {
    result.sellingPrice = validateMoney(
      data.sellingPrice,
      "sellingPrice",
      true
    );
  } else if (!partial && data.type === PRODUCT_TYPE.SIMPLE) {
    throw createValidationError(
      "sellingPrice is required for simple products"
    );
  }

  if (data.compareAtPrice !== undefined) {
    result.compareAtPrice = validateMoney(
      data.compareAtPrice,
      "compareAtPrice"
    );
  }

  if (data.barcode !== undefined) {
    result.barcode = optionalString(
      data.barcode,
      "barcode",
      100
    );
  }

  if (data.variants !== undefined || !partial) {
    result.variants = validateVariants(
      data.variants,
      data.type
    );
  }

  for (const field of [
    "trackInventory",
    "allowBackorder",
    "requiresShipping",
    "featured"
  ]) {
    if (data[field] !== undefined) {
      result[field] = validateBoolean(
        data[field],
        field
      );
    }
  }

  for (const field of [
    "stockQuantity",
    "lowStockAlert"
  ]) {
    if (data[field] !== undefined) {
      result[field] = validateNonNegativeInteger(
        data[field],
        field
      );
    }
  }

  for (const field of [
    "weight",
    "length",
    "width",
    "height"
  ]) {
    if (data[field] !== undefined) {
      result[field] = validateMoney(
        data[field],
        field
      );
    }
  }

  for (const field of [
    "seoTitle",
    "seoDescription",
    "seoKeywords"
  ]) {
    if (data[field] !== undefined) {
      result[field] = optionalString(
        data[field],
        field,
        1000
      );
    }
  }

  if (data.status !== undefined) {
    if (
      !Object.values(PRODUCT_STATUS).includes(data.status)
    ) {
      throw createValidationError(
        "Invalid product status"
      );
    }

    result.status = data.status;
  }

  return result;
}

export function validateCreateProduct(data) {
  return validateProductData(data);
}

export function validateUpdateProduct(data) {
  return validateProductData(data, {
    partial: true
  });
}
