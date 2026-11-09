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

// ১. Express Parsers (Webhook Signature ভেরিফাই করার জন্য verify যুক্ত করা হলো)
app.use(express.json({ 
  limit: '1mb',
  verify: (req, res, buf) => {
    req.rawBody = Buffer.from(buf);
  }
}));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ২. Facebook Webhook Route
// express.json() এর পরে থাকলেও verify ফাংশনের কারণে req.rawBody পাওয়া যাবে
app.use('/webhook/messenger', require('./src/facebook/webhook.routes'));

// ৩. API Rate Limiter
app.use('/api', apiLimiter);

// ৪. API Routes
app.use('/api/auth', require('./src/api/auth.routes'));
app.use('/api/ai', require('./src/api/ai.routes'));
app.use('/api/bot', require('./src/api/bot.routes'));
app.use('/api/categories', require('./src/api/category.routes'));
app.use('/api/coupons', require('./src/api/coupon.routes'));
app.use('/api/pos', require('./src/api/pos.routes'));
app.use('/api/dashboard', require('./src/api/dashboard.routes'));
app.use('/api/orders', require('./src/api/order.routes'));
app.use('/api/order-form', require('./src/api/orderForm.routes'));
app.use('/api/products', require('./src/api/product.routes'));
app.use('/api/lots', require('./src/api/lot.routes'));
app.use('/api/settings', require('./src/api/settings.routes'));

// Facebook OAuth & Settings Routes
app.use('/api/facebook', require('./src/facebook/facebook.routes'));

// ৫. Static Files Serve
app.use('/order', express.static(path.join(__dirname, 'public/order')));
app.use(express.static(path.join(__dirname, 'public')));

// ৬. Admin Panel-এর জন্য Fallback (SPA)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
    return res.status(404).json({ ok: false, error: 'route_not_found' });
  }
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ৭. Global Error Handler
app.use(errorHandler);

// ৮. Server Start
const port = Number(process.env.PORT || 3000);
const productCache = require('./src/services/catalog/productCache');

app.listen(port, () => {
  console.log(`Nishat Fashion server listening on port ${port}`);
  productCache.loadAll().catch(err => console.error('[PRODUCT CACHE] Startup load failed:', err));
});
