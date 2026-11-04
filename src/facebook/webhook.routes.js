const router = require('express').Router();
const crypto = require('crypto');
const { processWebhookEvent } = require('./webhook');

router.get('/', (req, res) => {
  const token = process.env.META_VERIFY_TOKEN;
  if (token && req.query['hub.verify_token'] === token) {
    console.log('[META WEBHOOK] Verification successful');
    return res.status(200).send(req.query['hub.challenge']);
  }
  console.log('[META WEBHOOK] Verification failed');
  return res.sendStatus(403);
});

router.post('/', (req, res) => {
  const secret = process.env.META_APP_SECRET;
  const signature = req.get('x-hub-signature-256') || '';
  if (!secret || !req.rawBody || !signature.startsWith('sha256=')) {
    console.error('[META WEBHOOK] Missing secret, rawBody or signature');
    return res.sendStatus(403);
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.error('[META WEBHOOK] Invalid signature');
    return res.sendStatus(403);
  }
  console.log('[META WEBHOOK] Event received:', req.body.object);
  res.sendStatus(200);
  setImmediate(() => {
    processWebhookEvent(req.body).catch(err => {
      console.error('[META WEBHOOK WORKER ERROR]', err);
    });
  });
});

module.exports = router;