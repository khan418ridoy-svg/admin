const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const { db } = require('../config/firebase');
router.get('/', adminAuth, asyncHandler(async (req, res) => {
  const [stats, recent, low] = await Promise.all([
    db.doc('meta/stats').get(),
    db.collection('orders').orderBy('createdAt','desc').limit(8).get(),
    db.collection('products').where('hasLowStock','==',true).limit(8).get()
  ]);
  res.json({ ok:true, stats:stats.data() || {}, recentOrders:recent.docs.map(d=>({id:d.id,...d.data()})), lowStock:low.docs.map(d=>({id:d.id,...d.data()})) });
}));
module.exports = router;