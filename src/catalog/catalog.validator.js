
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_NAME_LENGTH = 80;
const MAX_ID_LENGTH = 100;
const MAX_ICON_LENGTH = 20;
const MAX_CATEGORIES = 200;
const MAX_SUBCATEGORIES = 200;

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
    this.field = field;
  }
}

function rejectUnknownFields(data, allowedFields, context) {
  const unknownFields = Object.keys(data).filter(
    (field) => !allowedFields.includes(field)
  );

  if (unknownFields.length > 0) {
    throw new ValidationError(
      `${context}: Unknown field(s): ${unknownFields.join(", ")}`
    );
  }
}

function requireObject(data, context) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new ValidationError(`${context} must be an object`);
  }

  return data;
}

function validateName(value, field = "name") {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, field);
  }

  const name = value.trim();

  if (!name) {
    throw new ValidationError(`${field} is required`, field);
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(
      `${field} cannot exceed ${MAX_NAME_LENGTH} characters`,
      field
    );
  }

  return name;
}

function validateId(value, field = "id") {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, field);
  }

  const id = value.trim().toLowerCase();

  if (!id) {
    throw new ValidationError(`${field} is required`, field);
  }

  if (id.length > MAX_ID_LENGTH) {
    throw new ValidationError(
      `${field} cannot exceed ${MAX_ID_LENGTH} characters`,
      field
    );
  }

  if (!ID_PATTERN.test(id)) {
    throw new ValidationError(
      `${field} must contain lowercase letters, numbers and hyphens only`,
      field
    );
  }

  return id;
}

function validateIcon(value, field = "icon") {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, field);
  }

  const icon = value.trim();

  if (icon.length > MAX_ICON_LENGTH) {
    throw new ValidationError(
      `${field} cannot exceed ${MAX_ICON_LENGTH} characters`,
      field
    );
  }

  return icon;
}

function validateActive(value, field = "active") {
  if (value === undefined) {
    return true;
  }

  if (typeof value !== "boolean") {
    throw new ValidationError(`${field} must be a boolean`, field);
  }

  return value;
}

function validateUniqueIds(items, context) {
  const ids = new Set();

  for (const item of items) {
    if (ids.has(item.id)) {
      throw new ValidationError(
        `${context} contains duplicate id: ${item.id}`
      );
    }

    ids.add(item.id);
  }
}

export function validateSubcategory(data, index = 0) {
  const context = `Subcategory at index ${index}`;

  requireObject(data, context);

  rejectUnknownFields(
    data,
    ["id", "name", "icon", "active"],
    context
  );

  return {
    id: validateId(data.id, `${context}.id`),
    name: validateName(data.name, `${context}.name`),
    icon: validateIcon(data.icon, `${context}.icon`),
    active: validateActive(data.active, `${context}.active`)
  };
}

export function validateCategory(data, index = 0) {
  const context = `Category at index ${index}`;

  requireObject(data, context);

  rejectUnknownFields(
    data,
    ["id", "name", "icon", "active", "subcategories"],
    context
  );

  const subcategories = data.subcategories ?? [];

  if (!Array.isArray(subcategories)) {
    throw new ValidationError(
      `${context}.subcategories must be an array`
    );
  }

  if (subcategories.length > MAX_SUBCATEGORIES) {
    throw new ValidationError(
      `${context} cannot contain more than ${MAX_SUBCATEGORIES} subcategories`
    );
  }

  const normalizedSubcategories = subcategories.map(
    (subcategory, subcategoryIndex) =>
      validateSubcategory(subcategory, subcategoryIndex)
  );

  validateUniqueIds(
    normalizedSubcategories,
    `${context}.subcategories`
  );

  return {
    id: validateId(data.id, `${context}.id`),
    name: validateName(data.name, `${context}.name`),
    icon: validateIcon(data.icon, `${context}.icon`),
    active: validateActive(data.active, `${context}.active`),
    subcategories: normalizedSubcategories
  };
}

export function validateCollection(data) {
  const context = "Collection";

  requireObject(data, context);

  rejectUnknownFields(
    data,
    ["id", "name", "icon", "active", "categories"],
    context
  );

  const categories = data.categories ?? [];

  if (!Array.isArray(categories)) {
    throw new ValidationError(
      "Collection.categories must be an array"
    );
  }

  if (categories.length > MAX_CATEGORIES) {
    throw new ValidationError(
      `Collection cannot contain more than ${MAX_CATEGORIES} categories`
    );
  }

  const normalizedCategories = categories.map(
    (category, index) => validateCategory(category, index)
  );

  validateUniqueIds(normalizedCategories, "Collection.categories");

  return {
    id: validateId(data.id),
    name: validateName(data.name),
    icon: validateIcon(data.icon),
    active: validateActive(data.active),
    categories: normalizedCategories
  };
}

export function validateCollectionUpdate(data) {
  const context = "Collection update";

  requireObject(data, context);

  rejectUnknownFields(
    data,
    ["name", "icon", "active", "categories"],
    context
  );

  const result = {};

  if (Object.hasOwn(data, "name")) {
    result.name = validateName(data.name);
  }

  if (Object.hasOwn(data, "icon")) {
    result.icon = validateIcon(data.icon);
  }

  if (Object.hasOwn(data, "active")) {
    result.active = validateActive(data.active);
  }

  if (Object.hasOwn(data, "categories")) {
    if (!Array.isArray(data.categories)) {
      throw new ValidationError("categories must be an array");
    }

    if (data.categories.length > MAX_CATEGORIES) {
      throw new ValidationError(
        `Cannot contain more than ${MAX_CATEGORIES} categories`
      );
    }

    result.categories = data.categories.map(
      (category, index) => validateCategory(category, index)
    );

    validateUniqueIds(result.categories, "Collection.categories");
  }

  if (Object.keys(result).length === 0) {
    throw new ValidationError("At least one field is required for update");
  }

  return result;
}

export function validateCollectionId(id) {
  return validateId(id, "collectionId");
}

export function validateCategoryId(id) {
  return validateId(id, "categoryId");
}

export function validateSubcategoryId(id) {
  return validateId(id, "subcategoryId");
}
