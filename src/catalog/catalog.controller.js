
import {
  getTaxonomy,
  getCollection,
  createCollection,
  updateCollection,
  deactivateCollection,
  activateCollection
} from "./catalog.service.js";

import {
  createCategory,
  updateCategory,
  setCategoryActive,
  createSubcategory,
  updateSubcategory,
  setSubcategoryActive
} from "./catalog.nested.service.js";

function sendError(res, error) {
  const status = Number(error.status) || 500;

  if (status >= 500) {
    console.error("Catalog controller error:", error);
  }

  return res.status(status).json({
    success: false,
    message:
      status >= 500
        ? "Internal server error"
        : error.message
  });
}

function sendSuccess(res, result, message = "Operation successful", status = 200) {
  return res.status(status).json({
    success: true,
    message,
    ...result
  });
}

// ==============================
// TAXONOMY
// ==============================

export async function listTaxonomy(req, res) {
  try {
    const result = await getTaxonomy(req.query.version);

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// ==============================
// COLLECTION
// ==============================

export async function getCollectionById(req, res) {
  try {
    const collection = await getCollection(
      req.params.collectionId
    );

    return sendSuccess(res, { collection });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function createCollectionHandler(req, res) {
  try {
    const result = await createCollection(req.body);

    return sendSuccess(
      res,
      result,
      "Collection created successfully",
      201
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateCollectionHandler(req, res) {
  try {
    const result = await updateCollection(
      req.params.collectionId,
      req.body
    );

    return sendSuccess(
      res,
      result,
      "Collection updated successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function deactivateCollectionHandler(req, res) {
  try {
    const result = await deactivateCollection(
      req.params.collectionId
    );

    return sendSuccess(
      res,
      result,
      "Collection deactivated successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function activateCollectionHandler(req, res) {
  try {
    const result = await activateCollection(
      req.params.collectionId
    );

    return sendSuccess(
      res,
      result,
      "Collection activated successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}

// ==============================
// CATEGORY
// ==============================

export async function createCategoryHandler(req, res) {
  try {
    const result = await createCategory(
      req.params.collectionId,
      req.body
    );

    return sendSuccess(
      res,
      result,
      "Category created successfully",
      201
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateCategoryHandler(req, res) {
  try {
    const result = await updateCategory(
      req.params.collectionId,
      req.params.categoryId,
      req.body
    );

    return sendSuccess(
      res,
      result,
      "Category updated successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function deactivateCategoryHandler(req, res) {
  try {
    const result = await setCategoryActive(
      req.params.collectionId,
      req.params.categoryId,
      false
    );

    return sendSuccess(
      res,
      result,
      "Category deactivated successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function activateCategoryHandler(req, res) {
  try {
    const result = await setCategoryActive(
      req.params.collectionId,
      req.params.categoryId,
      true
    );

    return sendSuccess(
      res,
      result,
      "Category activated successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}

// ==============================
// SUBCATEGORY
// ==============================

export async function createSubcategoryHandler(req, res) {
  try {
    const result = await createSubcategory(
      req.params.collectionId,
      req.params.categoryId,
      req.body
    );

    return sendSuccess(
      res,
      result,
      "Subcategory created successfully",
      201
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateSubcategoryHandler(req, res) {
  try {
    const result = await updateSubcategory(
      req.params.collectionId,
      req.params.categoryId,
      req.params.subcategoryId,
      req.body
    );

    return sendSuccess(
      res,
      result,
      "Subcategory updated successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function deactivateSubcategoryHandler(req, res) {
  try {
    const result = await setSubcategoryActive(
      req.params.collectionId,
      req.params.categoryId,
      req.params.subcategoryId,
      false
    );

    return sendSuccess(
      res,
      result,
      "Subcategory deactivated successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}

export async function activateSubcategoryHandler(req, res) {
  try {
    const result = await setSubcategoryActive(
      req.params.collectionId,
      req.params.categoryId,
      req.params.subcategoryId,
      true
    );

    return sendSuccess(
      res,
      result,
      "Subcategory activated successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}
