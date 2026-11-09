const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/ai', require('./ai.routes'));
router.use('/bot', require('./bot.routes'));
router.use('/categories', require('./category.routes'));
router.use('/coupons', require('./coupon.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/orders', require('./order.routes'));
router.use('/order-form', require('./orderForm.routes'));
router.use('/products', require('./product.routes'));
router.use('/settings', require('./settings.routes'));
router.use('/facebook', require('../facebook/facebook.routes'));
router.use('/lots', require('./lot.routes'));
router.use('/pos', require('./pos.routes'));
module.exports = router;
