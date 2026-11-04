module.exports.attachRawBody = (req, res, next) => {
  req.rawBody = req.body; // Express raw buffer
  next();
};  