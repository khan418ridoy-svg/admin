
import { Router } from "express";

import {
  requireAdmin
} from "../auth/auth.middleware.js";

import {
  generateShortDescriptionHandler,
  generateFullDescriptionHandler,
  generateTagsHandler
} from "./ai.controller.js";

const router = Router();

// All AI endpoints require Admin authentication.
router.use(requireAdmin);

// POST /api/ai/products/:productId/short-description
router.post(
  "/products/:productId/short-description",
  generateShortDescriptionHandler
);

// POST /api/ai/products/:productId/full-description
router.post(
  "/products/:productId/full-description",
  generateFullDescriptionHandler
);

// POST /api/ai/products/:productId/tags
router.post(
  "/products/:productId/tags",
  generateTagsHandler
);

export default router;
