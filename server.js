
'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// ========================================
// App Configuration
// ========================================

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);

// ========================================
// Environment Validation
// ========================================

if (process.env.NODE_ENV === 'production') {
  if (!process.env.ADMIN_UIDS) {
    throw new Error(
      'ADMIN_UIDS is required in production.'
    );
  }
}

// ========================================
// Content Security Policy
// ========================================

const firebaseScriptSources = [
  "'self'",
  'https://www.gstatic.com',
  'https://apis.google.com'
];

const firebaseConnectSources = [
  "'self'",
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://firebaseinstallations.googleapis.com',
  'https://www.googleapis.com',
  'https://www.gstatic.com'
];

// ========================================
// Security Middleware
// ========================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],

      scriptSrc: firebaseScriptSources,

      // Explicit script element policy
      scriptSrcElem: firebaseScriptSources,

      connectSrc: firebaseConnectSources,

      frameSrc: [
        "'self'",
        'https://*.firebaseapp.com'
      ],

      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https:'
      ],

      styleSrc: [
         "'self'",
      "'unsafe-inline'",
      'https://cdnjs.cloudflare.com'
      ],

      fontSrc: [
        "'self'",
        'data:',
        'https:'
      ],

      objectSrc: ["'none'"],

      baseUri: ["'self'"],

      formAction: ["'self'"],

      upgradeInsecureRequests:
        process.env.NODE_ENV === 'production'
          ? []
          : null
    }
  }
}));

// ========================================
// CORS
// ========================================

const allowedOrigins = (
  process.env.CORS_ORIGINS || ''
)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow requests without Origin header
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },

  methods: [
    'GET',
    'POST',
    'PATCH',
    'PUT',
    'DELETE',
    'OPTIONS'
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization'
  ],

  credentials: false,

  maxAge: 600
}));

// ========================================
// Request Body Parser
// ========================================

app.use(express.json({
  limit: '1mb',
  strict: true
}));

app.use(express.urlencoded({
  extended: false,
  limit: '16kb'
}));

// ========================================
// Request Logging
// ========================================

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    );

    next();
  });
}

// ========================================
// Health Check
// ========================================

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'Nishat Fashion Category Admin',
    status: 'running',
    timestamp: Date.now()
  });
});

// ========================================
// API Routes
// ========================================

const authRoutes = require('./src/routes/auth.routes');
const taxonomyRoutes = require('./src/routes/taxonomy.routes');

app.use('/api/auth', authRoutes);
app.use('/api/taxonomy', taxonomyRoutes);

// ========================================
// API Not Found
// ========================================

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found.'
  });
});

// ========================================
// Static Frontend
// ========================================

app.use(express.static(PUBLIC_DIR, {
  index: false,

  maxAge:
    process.env.NODE_ENV === 'production'
      ? '1h'
      : 0
}));

// ========================================
// Admin HTML Shell
// ========================================

function sendAdminShell(req, res) {
  res
    .status(200)
    .type('html')
    .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#ffffff">
  <title>Nishat Fashion Admin</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/assets/js/app.js"></script>
</body>
</html>`);
}

// ========================================
// Admin Routes
// ========================================

app.get('/', sendAdminShell);
app.get('/login', sendAdminShell);

// ========================================
// Global 404 Handler
// ========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Page not found.'
  });
});

// ========================================
// Global Error Handler
// ========================================

app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', {
    message: err.message,
    path: req.originalUrl,
    method: req.method
  });

  if (res.headersSent) {
    return next(err);
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request data is too large.'
    });
  }

  if (
    err instanceof SyntaxError &&
    err.status === 400
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON request.'
    });
  }

  return res.status(err.status || 500).json({
    success: false,

    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error.'
        : err.message
  });
});

// ========================================
// Start Server
// ========================================

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('================================');
    console.log('Nishat Fashion Category Admin');
    console.log(`Server running on port ${PORT}`);
    console.log(
      `Environment: ${process.env.NODE_ENV || 'development'}`
    );
    console.log('================================');
  });
}

module.exports = app;
