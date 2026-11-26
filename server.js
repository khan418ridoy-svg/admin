
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

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        connectSrc: [
          "'self'",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com"
        ]
      }
    }
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "running",
    timestamp: new Date().toISOString()
  });
});

// Public Firebase Web SDK configuration
app.get("/api/config/firebase", (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  };

  if (!config.apiKey || !config.projectId) {
    return res.status(503).json({
      success: false,
      message: "Firebase Web configuration is incomplete"
    });
  }

  return res.json({
    success: true,
    config
  });
});

// Authentication API
app.use("/api/auth", authRoutes);

// Frontend shell (no physical HTML file)
app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fashion Business Admin</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/index.js"></script>
</body>
</html>`);
});

// Static frontend files
app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    dotfiles: "deny",
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
  })
);

// Unknown API
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

// Unknown resource
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Resource not found"
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(Number(err.status) || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Internal server error"
  });
});

app.listen(PORT, () => {
  console.log(`Fashion Admin running: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
