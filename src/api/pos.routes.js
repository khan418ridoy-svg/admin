const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const { createOrder } = require('../services/orders/createOrder');
const { db } = require('../config/firebase');

router.use(adminAuth);

// ১. POS চেকআউট (অর্ডার তৈরি)
router.post('/checkout', asyncHandler(async (req, res) => {
  const { items, customer, paymentMethod } = req.body;
  
  if (!items || !items.length) return res.status(400).json({ ok: false, error: 'empty_cart' });
  if (!customer || !customer.name || !customer.phone) return res.status(400).json({ ok: false, error: 'customer_info_required' });

  const verification = { verdict: 'ok', reasons: ['POS Sale'] }; // POS সেলের জন্য ভেরিফিকেশন লাগবে না

  try {
    const order = await createOrder({
      customer: { 
        name: customer.name, 
        phone: customer.phone, 
        address: customer.address || 'Store Pickup', 
        district: customer.district || 'Dhaka' 
      },
      items,
      verification,
      conversationId: null, // POS-এর জন্য কোনো Messenger ID নেই
      idempotencyKey: `pos-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      source: 'pos',
      paymentMethod: paymentMethod || 'cash'
    });

    res.json({ ok: true, order });
  } catch (error) {
    console.error('[POS Checkout Failed]', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}));

// ২. দ্রুত প্রোডাক্ট সার্চ (POS-এর জন্য)
router.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!q) return res.json({ ok: true, items: [] });

  // ডাটাবেস থেকে নাম, SKU বা ShortCode দিয়ে সার্চ
  const snap = await db.collection('products').where('status', '==', 'active').get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(p => 
      (p.name || '').toLowerCase().includes(q) || 
      (p.sku || '').toLowerCase().includes(q) || 
      (p.shortCode || '').toLowerCase().includes(q)
    ).slice(0, 10); // সর্বোচ্চ ১০টি রেজাল্ট

  res.json({ ok: true, items });
}));

module.exports = router;
