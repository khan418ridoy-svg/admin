
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import dotenv from "dotenv";

import authRoutes from "./src/auth/auth.routes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");

// Security headers
app.use(helmet());

// Request parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    name: "Fashion Business Admin",
    status: "running",
    timestamp: new Date().toISOString()
  });
});

// Authentication API
app.use("/api/auth", authRoutes);

// Frontend entry point (no physical HTML file)
app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#ffffff">
  <title>Fashion Business Admin</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/index.js"></script>
</body>
</html>`);
});

// Frontend static files
app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    dotfiles: "deny",
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
  })
);

// Unknown API route
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

// Unknown route
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Resource not found"
  });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);

  if (res.headersSent) {
    return next(err);
  }

  const statusCode = Number(err.status) || 500;

  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Internal server error"
  });
});

// Start server
app.listen(PORT, () => {
  console.log("-----------------------------------");
  console.log("Fashion Business Admin is running");
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Auth: http://localhost:${PORT}/api/auth`);
  console.log("-----------------------------------");
});
