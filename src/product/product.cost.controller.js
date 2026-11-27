
import {
  getProductCost,
  saveProductCost,
  deleteProductCost
} from "./product.cost.service.js";

function sendCostError(res, error, action) {
  const status = Number(error.status) || 500;

  if (status >= 500) {
    console.error(`${action} error:`, error);
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
 * GET /api/products/:productId/cost
 */
export async function getProductCostHandler(req, res) {
  try {
    const result = await getProductCost(
      req.params.productId
    );

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,
      cost: result
    });
  } catch (error) {
    return sendCostError(
      res,
      error,
      "Get product cost"
    );
  }
}

/**
 * PUT /api/products/:productId/cost
 */
export async function saveProductCostHandler(req, res) {
  try {
    const { cost, variants } = req.body || {};

    const result = await saveProductCost({
      productId: req.params.productId,
      cost,
      variants
    });

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,
      message: "Product cost saved successfully.",
      cost: result
    });
  } catch (error) {
    return sendCostError(
      res,
      error,
      "Save product cost"
    );
  }
}

/**
 * DELETE /api/products/:productId/cost
 */
export async function deleteProductCostHandler(req, res) {
  try {
    const result = await deleteProductCost(
      req.params.productId
    );

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,
      message: "Product cost deleted successfully.",
      result
    });
  } catch (error) {
    return sendCostError(
      res,
      error,
      "Delete product cost"
    );
  }
}
