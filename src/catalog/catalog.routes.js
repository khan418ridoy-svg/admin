
import { Router } from "express";

import { requireAdmin } from "../auth/auth.middleware.js";

import {
  listTaxonomy,
  getCollectionById,
  createCollectionHandler,
  updateCollectionHandler,
  deactivateCollectionHandler,
  activateCollectionHandler
} from "./catalog.controller.js";

const router = Router();

// সব Catalog API-তে Admin authentication বাধ্যতামূলক
router.use(requireAdmin);

// Taxonomy
router.get("/", listTaxonomy);

// Collection
router.get("/:collectionId", getCollectionById);
router.post("/", createCollectionHandler);
router.patch("/:collectionId", updateCollectionHandler);

// Collection status
router.patch(
  "/:collectionId/deactivate",
  deactivateCollectionHandler
);

router.patch(
  "/:collectionId/activate",
  activateCollectionHandler
);

export default router;
