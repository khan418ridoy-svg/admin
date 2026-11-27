
import { Router } from "express";

import { requireAdmin } from "../auth/auth.middleware.js";

import {
  listProductsHandler,
  getProductHandler,
  createProductHandler,
  updateProductHandler
} from "./product.controller.js";

const router = Router();

// Protect all Product Catalog routes.
router.use(requireAdmin);

// GET /api/products
// Product list with filters and pagination.
router.get("/", listProductsHandler);

// POST /api/products
// Create a new Product.
router.post("/", createProductHandler);

// GET /api/products/:productId
// Get Product details.
router.get("/:productId", getProductHandler);

// PATCH /api/products/:productId
// Update Product.
router.patch("/:productId", updateProductHandler);

export default router;
