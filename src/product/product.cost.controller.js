
import {
  getProductCost,
  saveProductCost,
  deleteProductCost
} from "./product.cost.service.js";

/**
 * GET /api/products/:productId/cost
 * একটি Product-এর Cost Price পড়বে।
 */
export const getProductCostHandler = async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await getProductCost(productId);

    return res.status(200).json({
      success: true,
      cost: result
    });
  } catch (error) {
    console.error("Get product cost error:", error);

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 500
          ? "Failed to load product cost."
          : error.message
    });
  }
};

/**
 * PUT /api/products/:productId/cost
 * Product Cost এবং Variant Cost সংরক্ষণ করবে।
 *
 * Request body:
 * {
 *   "cost": 300,
 *   "variants": {
 *     "variantId_red_m": 200,
 *     "variantId_blue_l": 250
 *   }
 * }
 */
export const saveProductCostHandler = async (req, res) => {
  try {
    const { productId } = req.params;
    const { cost, variants } = req.body || {};

    const result = await saveProductCost({
      productId,
      cost,
      variants
    });

    return res.status(200).json({
      success: true,
      message: "Product cost saved successfully.",
      cost: result
    });
  } catch (error) {
    console.error("Save product cost error:", error);

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 500
          ? "Failed to save product cost."
          : error.message
    });
  }
};

/**
 * DELETE /api/products/:productId/cost
 * একটি Product-এর Cost Price মুছে ফেলবে।
 */
export const deleteProductCostHandler = async (req, res) => {
  try {
    const { productId } = req.params;

    await deleteProductCost(productId);

    return res.status(200).json({
      success: true,
      message: "Product cost deleted successfully."
    });
  } catch (error) {
    console.error("Delete product cost error:", error);

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 500
          ? "Failed to delete product cost."
          : error.message
    });
  }
};
