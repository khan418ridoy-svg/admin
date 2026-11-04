const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const gemini = require('../services/ai/gemini');
const cloudflare = require('../services/ai/cloudflare');

// সব রাউটে অ্যাডমিন অথেনটিকেশন বাধ্যতামূলক
router.use(adminAuth);

// ১. AI স্ট্যাটাস চেক (কোন কোন API সেট আছে তা দেখার জন্য)
router.get('/status', asyncHandler(async (req, res) => {
  let cfStatus = { configuredAccountCount: 0, maximumAccounts: 10, chatModel: 'N/A', verificationModel: 'N/A' };
  try {
    if (cloudflare && cloudflare.status) {
      cfStatus = cloudflare.status();
    }
  } catch (e) {
    console.warn('[AI Status] Cloudflare status check failed:', e.message);
  }

  res.json({
    ok: true,
    provider: 'Google Gemini',
    gemini: gemini.status(),
    cloudflare: cfStatus,
    note: 'Customer chat and order verification both use Gemini. Secret values are never exposed.'
  });
}));

// ২. AI কানেকশন টেস্ট (Gemini বা Cloudflare)
router.post('/test', asyncHandler(async (req, res) => {
  const provider = req.body.provider;
  const prompt = [{ role: 'user', content: 'Reply with exactly: CONNECTION_OK' }];
  
  try {
    if (provider === 'gemini') {
      const r = await gemini.generate(prompt);
      return res.json({ ok: true, provider, model: r.model, keySlot: r.keySlot, response: r.text });
    }
    
    if (provider === 'cloudflare-chat') {
      if (!cloudflare || !cloudflare.chat) throw new Error('Cloudflare module not loaded');
      const r = await cloudflare.chat(prompt);
      return res.json({ ok: true, provider, model: r.model, accountSlot: r.accountSlot, response: r.text });
    }

    if (provider === 'cloudflare-verify') {
      if (!cloudflare || !cloudflare.verify) throw new Error('Cloudflare module not loaded');
      const r = await cloudflare.verify(prompt);
      return res.json({ ok: true, provider, model: r.model, accountSlot: r.accountSlot, response: r.text });
    }

    return res.status(400).json({ ok: false, error: 'unknown_ai_provider' });
  } catch (error) {
    // কনসোলে আসল এরর দেখাবে
    console.error(`[AI Test Failed - ${provider}]`, error.message);
    // ফ্রন্টএন্ডে সুন্দর মেসেজ পাঠাবে
    return res.status(500).json({ ok: false, error: error.message || 'ai_test_failed' });
  }
}));

// ৩. প্রোডাক্ট কন্টেন্ট জেনারেট (Gemini দিয়ে)
router.post('/product-content', asyncHandler(async (req, res) => {
  const { product = {}, fields, language = 'English' } = req.body || {};
  
  if (!String(product.name || '').trim()) {
    return res.status(400).json({ ok: false, error: 'product_name_required' });
  }
  
  try {
    const r = await gemini.generateProductContent({ product, fields, language });
    res.json({ ok: true, fields: r.fields, model: r.model, keySlot: r.keySlot });
  } catch (error) {
    console.error('[AI Product Content Failed]', error.message);
    res.status(500).json({ ok: false, error: error.message || 'content_generation_failed' });
  }
}));

module.exports = router;
