
import {
  getTaxonomy,
  getCollection,
  createCollection,
  updateCollection,
  deactivateCollection,
  activateCollection
} from "./catalog.service.js";

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

/**
 * GET /api/catalog
 *
 * Query:
 * ?version=6
 */
export async function listTaxonomy(req, res) {
  try {
    const version = req.query.version;

    const result = await getTaxonomy(version);

    res.setHeader("Cache-Control", "no-store");

    if (result.notModified) {
      return res.status(200).json({
        success: true,
        notModified: true,
        version: result.version,
        updatedAt: result.updatedAt
      });
    }

    return res.status(200).json({
      success: true,
      notModified: false,
      version: result.version,
      updatedAt: result.updatedAt,
      collections: result.collections
    });
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * GET /api/catalog/:collectionId
 */
export async function getCollectionById(req, res) {
  try {
    const collection = await getCollection(
      req.params.collectionId
    );

    return res.status(200).json({
      success: true,
      collection
    });
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * POST /api/catalog
 */
export async function createCollectionHandler(req, res) {
  try {
    const result = await createCollection(req.body);

    return res.status(201).json({
      success: true,
      message: "Collection created successfully",
      ...result
    });
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * PATCH /api/catalog/:collectionId
 */
export async function updateCollectionHandler(req, res) {
  try {
    const result = await updateCollection(
      req.params.collectionId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Collection updated successfully",
      ...result
    });
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * PATCH /api/catalog/:collectionId/deactivate
 */
export async function deactivateCollectionHandler(req, res) {
  try {
    const result = await deactivateCollection(
      req.params.collectionId
    );

    return res.status(200).json({
      success: true,
      message: "Collection deactivated successfully",
      ...result
    });
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * PATCH /api/catalog/:collectionId/activate
 */
export async function activateCollectionHandler(req, res) {
  try {
    const result = await activateCollection(
      req.params.collectionId
    );

    return res.status(200).json({
      success: true,
      message: "Collection activated successfully",
      ...result
    });
  } catch (error) {
    return sendError(res, error);
  }
}
