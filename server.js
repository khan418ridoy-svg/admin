require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { apiLimiter } = require('./src/middleware/rateLimit');
const { errorHandler } = require('./src/middleware/errorHandler');

const app = express();

// Render / Proxy সেটিংস
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Nishat Fashion Backend',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Webhook রাউট (express.json এর আগে থাকতে হবে)
// Facebook Webhook Signature ভেরিফাই করার জন্য rawBody দরকার
app.use('/webhook/messenger', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body;
  next();
}, require('./src/facebook/webhook.routes'));

// Express Parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// API Rate Limiter
app.use('/api', apiLimiter);

// --- API Routes (নতুন ফোল্ডার স্ট্রাকচার অনুযায়ী) ---
app.use('/api/auth', require('./src/api/auth.routes'));
app.use('/api/ai', require('./src/api/ai.routes'));
app.use('/api/bot', require('./src/api/bot.routes'));
app.use('/api/categories', require('./src/api/category.routes'));
app.use('/api/coupons', require('./src/api/coupon.routes'));
app.use('/api/dashboard', require('./src/api/dashboard.routes'));
app.use('/api/orders', require('./src/api/order.routes'));
app.use('/api/order-form', require('./src/api/orderForm.routes'));
app.use('/api/products', require('./src/api/product.routes'));
app.use('/api/settings', require('./src/api/settings.routes'));

// Facebook OAuth & Settings Routes
app.use('/api/facebook', require('./src/facebook/facebook.routes'));

// --- Static Files Serve ---
app.use('/order', express.static(path.join(__dirname, 'public/order')));
app.use(express.static(path.join(__dirname, 'public')));

// Admin Panel-এর জন্য Fallback (SPA)
// ১. Static Files (এটি অবশ্যই app.get('*') এর আগে থাকতে হবে)
app.use('/order', express.static(path.join(__dirname, 'public/order')));
app.use(express.static(path.join(__dirname, 'public')));

// ২. Admin Panel-এর জন্য Fallback (SPA)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
    return res.status(404).json({ ok: false, error: 'route_not_found' });
  }
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ৩. Error Handler
app.use(errorHandler);

// Global Error Handler
app.use(errorHandler);

// Server Start
const port = Number(process.env.PORT || 3000);
const productCache = require('./src/services/catalog/productCache');

app.listen(port, () => {
  console.log(`Nishat Fashion server listening on port ${port}`);
  // Product Cache লোড করা (যাতে বট দ্রুত কাজ করে)
  productCache.loadAll().catch(err => console.error('[PRODUCT CACHE] Startup load failed:', err));
});