const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const { db } = require('../config/firebase');

router.get('/', adminAuth, asyncHandler(async (req, res) => {
  const [s, b] = await Promise.all([db.doc('meta/publicSettings').get(), db.doc('meta/botConfig').get()]);
  res.json({ ok: true, settings: s.data() || {}, bot: b.data() || {} });
}));

router.put('/', adminAuth, asyncHandler(async (req, res) => {
  const body = req.body || {}, patch = { updatedAt: Date.now() };
  
  for (const key of ['deliveryDhaka', 'deliveryOutside']) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ ok: false, error: `invalid_${key}` });
      patch[key] = n;
    }
  }
  
  if (body.paymentDiscount !== undefined) {
    const p = body.paymentDiscount || {}, percent = Number(p.percent), minPurchase = Number(p.minPurchase), maxDiscount = Number(p.maxDiscount);
    if (!(percent >= 0 && percent <= 100) || minPurchase < 0 || maxDiscount < 0) return res.status(400).json({ ok: false, error: 'invalid_payment_discount' });
    patch.paymentDiscount = { enabled: p.enabled === true, percent, minPurchase, maxDiscount };
  }

  if (body.deliveryRules !== undefined) {
    if (!Array.isArray(body.deliveryRules)) return res.status(400).json({ ok: false, error: 'invalid_delivery_rules' });
    // ভ্যালিডেশন
    for (const rule of body.deliveryRules) {
      if (Number(rule.minAmount) < 0) return res.status(400).json({ ok: false, error: 'invalid_min_amount' });
      if (!['percent', 'free'].includes(rule.type)) return res.status(400).json({ ok: false, error: 'invalid_rule_type' });
      if (rule.type === 'percent' && (Number(rule.value) < 0 || Number(rule.value) > 100)) return res.status(400).json({ ok: false, error: 'invalid_percent' });
    }
    patch.deliveryRules = body.deliveryRules;
  }

  await db.doc('meta/publicSettings').set(patch, { merge: true });
  res.json({ ok: true, settings: patch });
}));

module.exports = router;