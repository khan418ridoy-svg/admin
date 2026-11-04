module.exports = {
  SITE_URL: process.env.SITE_URL || 'http://127.0.0.1:3000',
  GRAPH_VERSION: process.env.META_GRAPH_VERSION || 'v26.0',
  GEMINI_MODELS: (process.env.GEMINI_MODELS || 'gemini-3.6-flash,gemini-3.7-flash,gemini-3-flash-preview,gemini-3.1-flash-lite-preview,gemini-flash-latest,gemini-flash-lite-latest').split(',').map(x => x.trim()).filter(Boolean).slice(0, 6),
  HISTORY_LIMIT: 20,
  MAX_CATEGORY_PRODUCTS: 5,
  DELIVERY_DHAKA: Number(process.env.DELIVERY_DHAKA || 80),
  DELIVERY_OUTSIDE: Number(process.env.DELIVERY_OUTSIDE || 130)
};