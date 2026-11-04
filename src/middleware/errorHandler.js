module.exports.errorHandler = (err, req, res, next) => {
  console.error('[api-error]', err.message);
  res.status(err.status || 500).json({ ok: false, error: err.publicCode || 'server_error' });
};