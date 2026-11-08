const catalog = require('../services/catalog/search');
const productCache = require('../services/catalog/productCache');
const gemini = require('../services/ai/gemini');

const ALLOWED_IMAGE_HOSTS = /(^|\.)(fbcdn\.net|fbsbx\.com|cloudinary\.com)$/i;
async function readImage(url, maxBytes = 5 * 1024 * 1024) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.test(parsed.hostname)) throw new Error('image_host_not_allowed');
  const response = await fetch(parsed, { signal: AbortSignal.timeout(10000), redirect: 'follow' });
  if (!response.ok) throw new Error(`image_fetch_${response.status}`);
  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.test(finalUrl.hostname)) throw new Error('image_redirect_host_not_allowed');
  const type = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new Error('unsupported_image_type');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > maxBytes) throw new Error('image_size_invalid');
  return { data: buffer.toString('base64'), mimeType: type };
}

async function matchProductImage(imageUrl) {
  const customerImage = await readImage(imageUrl);
  await catalog.refresh();
  // Search catalog broadly using a visual description generated from the customer image.
  const description = await gemini.describeProductImage(customerImage);
  const terms = description.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x => x.length > 2);
  const candidates = (await productCache.getProducts())
    .filter(p => p.status === 'active' && p.mainImage)
    .map(p => {
      const haystack = [p.name, p.shortDescription, p.description, p.categoryName, p.subCategoryName, ...(p.tags || []), ...(p.availableColors || p.colors || [])].join(' ').toLowerCase();
      const score = terms.reduce((n, term) => n + (haystack.includes(term) ? 1 : 0), 0);
      return { product: p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.product);
  if (!candidates.length) return { matched: false, reason: 'no_catalog_candidates' };
  const enriched = [];
  for (const p of candidates) {
    try { enriched.push({ product: p, image: await readImage(p.mainImage, 4 * 1024 * 1024) }); }
    catch (e) { console.warn('[image-match] candidate image skipped', p.id, e.message); }
  }
  if (!enriched.length) return { matched: false, reason: 'candidate_images_unavailable' };
  const result = await gemini.compareProductImages(customerImage, enriched.map(x => ({
    id: x.product.id, name: x.product.name, code: x.product.shortCode || x.product.sku || '',
    image: x.image
  })));
  const chosen = enriched.find(x => x.product.id === result.productId);
  if (!chosen || Number(result.confidence) < 0.88) return { matched: false, reason: 'low_confidence' };
  return { matched: true, product: chosen.product, confidence: Number(result.confidence), description };
}

module.exports = { matchProductImage };
