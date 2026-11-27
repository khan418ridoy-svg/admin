
import { Router } from "express";

import { requireAdmin } from "../auth/auth.middleware.js";

import {
  listProductsHandler,
  getProductHandler,
  createProductHandler,
  updateProductHandler
} from "./product.controller.js";

import {
  getProductCostHandler,
  saveProductCostHandler,
  deleteProductCostHandler
} from "./product.cost.controller.js";

const router = Router();

// Protect all Product Catalog routes.
router.use(requireAdmin);

// GET /api/products
// Product list with filters and pagination.
router.get("/", listProductsHandler);

// POST /api/products
// Create a new Product.
router.post("/", createProductHandler);

// GET /api/products/:productId/cost
// Get private Product and Variant Cost.
router.get("/:productId/cost", getProductCostHandler);

// PUT /api/products/:productId/cost
// Save private Product and Variant Cost.
router.put("/:productId/cost", saveProductCostHandler);

// DELETE /api/products/:productId/cost
// Delete private Product and Variant Cost.
router.delete("/:productId/cost", deleteProductCostHandler);

// GET /api/products/:productId
// Get Product details.
router.get("/:productId", getProductHandler);

// PATCH /api/products/:productId
// Update Product.
router.patch("/:productId", updateProductHandler);

export default router;
