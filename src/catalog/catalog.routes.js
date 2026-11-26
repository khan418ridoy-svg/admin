
import { Router } from "express";

import { requireAdmin } from "../auth/auth.middleware.js";

import {
  listTaxonomy,
  getCollectionById,
  createCollectionHandler,
  updateCollectionHandler,
  deactivateCollectionHandler,
  activateCollectionHandler,
  createCategoryHandler,
  updateCategoryHandler,
  deactivateCategoryHandler,
  activateCategoryHandler,
  createSubcategoryHandler,
  updateSubcategoryHandler,
  deactivateSubcategoryHandler,
  activateSubcategoryHandler
} from "./catalog.controller.js";

const router = Router();

// সব Catalog API-তে Admin authentication বাধ্যতামূলক
router.use(requireAdmin);

// ==============================
// TAXONOMY
// ==============================

router.get("/", listTaxonomy);

// ==============================
// COLLECTION
// ==============================

router.post("/", createCollectionHandler);

router.get("/:collectionId", getCollectionById);

router.patch("/:collectionId", updateCollectionHandler);

router.patch(
  "/:collectionId/activate",
  activateCollectionHandler
);

router.patch(
  "/:collectionId/deactivate",
  deactivateCollectionHandler
);

// ==============================
// CATEGORY
// ==============================

router.post(
  "/:collectionId/categories",
  createCategoryHandler
);

router.patch(
  "/:collectionId/categories/:categoryId",
  updateCategoryHandler
);

router.patch(
  "/:collectionId/categories/:categoryId/activate",
  activateCategoryHandler
);

router.patch(
  "/:collectionId/categories/:categoryId/deactivate",
  deactivateCategoryHandler
);

// ==============================
// SUBCATEGORY
// ==============================

router.post(
  "/:collectionId/categories/:categoryId/subcategories",
  createSubcategoryHandler
);

router.patch(
  "/:collectionId/categories/:categoryId/subcategories/:subcategoryId",
  updateSubcategoryHandler
);

router.patch(
  "/:collectionId/categories/:categoryId/subcategories/:subcategoryId/activate",
  activateSubcategoryHandler
);

router.patch(
  "/:collectionId/categories/:categoryId/subcategories/:subcategoryId/deactivate",
  deactivateSubcategoryHandler
);

export default router;
