const express = require('express');
const path = require('path');
const { attachRawBody } = require('./middleware/rawBody');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();

// Webhook raw body setup (must be before express.json)
app.use('/api/webhook', express.raw({ type: 'application/json' }), attachRawBody, require('./facebook/webhook.routes'));

// Express parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (Admin Panel & Order Form)
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api', apiLimiter, require('./api/index'));

// Error Handler
app.use(errorHandler);

module.exports = app;