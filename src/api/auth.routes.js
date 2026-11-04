const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
router.get('/me', adminAuth, (req, res) => res.json({ ok: true, uid: req.user.uid, email: req.user.email }));
module.exports = router;