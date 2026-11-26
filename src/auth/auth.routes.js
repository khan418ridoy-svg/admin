
import { Router } from "express";

import {
  login,
  logout,
  me
} from "./auth.controller.js";

import { requireAdmin } from "./auth.middleware.js";

const router = Router();

// Admin login
router.post("/login", login);

// Current logged-in admin
router.get("/me", requireAdmin, me);

// Admin logout
router.post("/logout", logout);

export default router;
