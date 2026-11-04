const { auth } = require('../config/firebase');
module.exports = async function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ ok: false, error: 'authentication_required' });
    const decoded = await auth.verifyIdToken(token);
    if (decoded.admin !== true) return res.status(403).json({ ok: false, error: 'admin_only' });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'invalid_session' });
  }
};