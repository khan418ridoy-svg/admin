
import {
  createProduct,
  getProduct,
  updateProduct,
  listProducts
} from "./product.service.js";

function sendError(res, error) {
  const status = Number(error.status) || 500;

  if (status >= 500) {
    console.error("Product controller error:", error);
  }

  return res.status(status).json({
    success: false,
    message:
      status >= 500
        ? "Internal server error"
        : error.message
  });
}

function sendSuccess(
  res,
  result,
  message = "Operation successful",
  status = 200
) {
  return res.status(status).json({
    success: true,
    message,
    ...result
  });
}

/**
 * GET /api/products
 *
 * Query:
 * ?limit=20
 * &cursor=productId
 * &status=active
 * &collectionId=collection-id
 * &categoryId=category-id
 */
export async function listProductsHandler(req, res) {
  try {
    const {
      limit,
      cursor,
      status,
      collectionId,
      categoryId
    } = req.query;

    const result = await listProducts({
      limit:
        limit === undefined
          ? 20
          : Number(limit),
      cursor,
      status,
      collectionId,
      categoryId
    });

    res.setHeader("Cache-Control", "no-store");

    return sendSuccess(
      res,
      result,
      "Products loaded successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * GET /api/products/:productId
 */
export async function getProductHandler(req, res) {
  try {
    const product = await getProduct(
      req.params.productId
    );

    res.setHeader("Cache-Control", "no-store");

    return sendSuccess(
      res,
      { product },
      "Product loaded successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * POST /api/products
 */
export async function createProductHandler(req, res) {
  try {
    const result = await createProduct(
      req.body
    );

    res.setHeader("Cache-Control", "no-store");

    return sendSuccess(
      res,
      result,
      "Product created successfully",
      201
    );
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * PATCH /api/products/:productId
 */
export async function updateProductHandler(req, res) {
  try {
    const result = await updateProduct(
      req.params.productId,
      req.body
    );

    res.setHeader("Cache-Control", "no-store");

    return sendSuccess(
      res,
      result,
      "Product updated successfully"
    );
  } catch (error) {
    return sendError(res, error);
  }
}
