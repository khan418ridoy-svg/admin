const cache = require('./productCache');

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';
const norm = value => String(value ?? '').normalize('NFKC').replace(/[০-৯]/g, d => String(BANGLA_DIGITS.indexOf(d))).toLowerCase().replace(/[৳]/g, ' ').replace(/[^\p{L}\p{N}\p{M}.]+/gu, ' ').replace(/\s+/g, ' ').trim();
const tokens = value => norm(value).split(' ').filter(Boolean);

const SYNONYMS = [
  ['shirt', ['শার্ট', 'jama', 'জামা', 'shirt']],
  ['t shirt', ['tshirt', 't-shirt', 'টি শার্ট', 'টি-শার্ট', 't shirt']],
  ['polo', ['পোলো', 'polo shirt']],
  ['pant', ['প্যান্ট', 'trouser', 'trousers']],
  ['red', ['লাল', 'lal', 'red']],
  ['black', ['কালো', 'kalo', 'black']],
  ['white', ['সাদা', 'shada', 'white']],
  ['blue', ['নীল', 'nil', 'neel', 'blue']],
  ['green', ['সবুজ', 'shobuj', 'sobuj', 'green']],
  ['full sleeve', ['ফুল স্লিভ', 'full sleeve', 'fullsleeve', 'লং স্লিভ']],
  ['half sleeve', ['হাফ স্লিভ', 'half sleeve', 'short sleeve']],
  ['men', ['পুরুষ', 'ছেলেদের', 'mens', 'men']],
  ['women', ['মহিলা', 'মেয়েদের', 'মহিলাদের', 'ladies', 'womens']],
  ['casual', ['ক্যাজুয়াল', 'casual']],
  ['polyester', ['পলিয়েস্টার', 'polyester']],
  ['cotton', ['কটন', 'সুতি', 'cotton']],
  ['regular fit', ['রেগুলার ফিট', 'regular fit']],
  ['slim fit', ['স্লিম ফিট', 'slim fit']]
];

function expandTerms(query) {
  const q = norm(query);
  const found = new Set(tokens(q));
  for (const [canonical, variants] of SYNONYMS) {
    if (variants.some(v => q.includes(norm(v))) || q.includes(norm(canonical))) {
      tokens(canonical).forEach(x => found.add(x));
      variants.forEach(v => tokens(v).forEach(x => found.add(x)));
    }
  }
  return [...found];
}

function parsePrice(query) {
  const q = norm(query);
  const nums = [...q.matchAll(/\d+(?:\.\d+)?/g)].map(x => Number(x[0])).filter(Number.isFinite);
  if (!nums.length) return null;
  const hasMoney = /টাকা|টাকায়|taka|tk|৳|price|দাম/.test(String(query).toLowerCase());
  const hasBudget = /মধ্যে|ভিতরে|নিচে|কম|vitore|moddhe|niche|under|below|within|less than|max|সর্বোচ্চ/.test(q);
  const hasAbove = /বেশি|উপরে|অধিক|beshi|upore|above|over|more than|greater than/.test(q);
  const hasRange = /থেকে|হতে|মাঝে|theke|hote|majhe|between|to/.test(q) && nums.length >= 2;
  if (hasRange) return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]), type: 'range' };
  if (hasAbove) return { min: nums[0], minExclusive: true, type: 'above' };
  if (hasBudget) return { max: nums[0], type: 'max' };
  if (hasMoney || nums.length === 1) return { target: nums[0], tolerance: Math.max(50, nums[0] * 0.1), type: 'near' };
  return null;
}

function sellingPrices(p) {
  const variants = Object.values(p.variants || {}).filter(v => v && v.isActive !== false);
  const prices = variants.map(v => Number(v.sellingPrice) > 0 ? Number(v.sellingPrice) : Number(p.baseSellingPrice ?? p.sellingPrice ?? p.price ?? 0)).filter(x => x >= 0);
  if (prices.length) return prices;
  return [Number(p.sellingPrice ?? p.baseSellingPrice ?? p.price ?? p.minPrice ?? 0)].filter(x => x >= 0);
}
function matchesPrice(p, filter) {
  if (!filter) return true;
  return sellingPrices(p).some(price => {
    if (filter.type === 'range') return price >= filter.min && price <= filter.max;
    if (filter.type === 'max') return price <= filter.max;
    if (filter.type === 'above') return filter.minExclusive ? price > filter.min : price >= filter.min;
    if (filter.type === 'near') return Math.abs(price - filter.target) <= filter.tolerance;
    return true;
  });
}
function productFields(p) {
  const paths = p.categoryPaths || p.categories || [];
  const variants = Object.values(p.variants || {}).filter(v => v && v.isActive !== false && Number(v.stock) > 0);
  return {
    name: norm(p.name),
    code: norm([p.shortCode, p.sku, p.id].join(' ')),
    category: norm(paths.map(x => [x.collectionName, x.categoryName, x.subCategoryName].join(' ')).join(' ')),
    tags: norm([...(p.tags || []), ...(p.searchKeywords || []), ...(p.keywords || [])].join(' ')),
    attrs: norm([p.brand, p.collectionName, p.subCategoryName, p.categoryName, p.fabricType, p.fabric, p.fit, p.sleeveType, p.description, p.shortDescription, ...(p.availableColors || p.colors || []), ...(p.availableSizes || p.sizes || []), ...variants.flatMap(v => [v.color, v.size, v.variantSku, v.fabricType, v.fit, v.sleeveType])].join(' '))
  };
}
function scoreProduct(p, query) {
  const q = norm(query);
  const f = productFields(p);
  if (!q) return 0;
  if (f.name === q) return 95;
  const terms = expandTerms(query).filter(t => t.length > 1);
  const filler = new Set(['ase','ache','show','please','product','products','takar','taka','tk','price','দাম','টাকার','টাকা','মধ্যে','ভিতরে','নিচে','থেকে','হতে','মাঝে','দেখান','আছে','চাই','একটি','আমার','জন্য','size','sized','collection','category','vitore','moddhe','niche','beshi','upore','theke','hote','majhe','under','below','within','between','from','to','over','more','than']);
  const core = tokens(query).filter(t => !/^\d+$/.test(t) && !filler.has(t));
  const searchable = `${f.name} ${f.category} ${f.tags} ${f.attrs}`;
  if (core.length > 1 && !core.every(term => searchable.split(/\s+/).includes(term))) return 0;
  let score = 0;
  if (f.name.includes(q)) score += 90;
  for (const term of terms) {
    if (f.name.split(' ').includes(term)) score += 18;
    else if (f.name.includes(term)) score += 12;
    if (f.category.includes(term)) score += 16;
    if (f.tags.includes(term)) score += 15;
    if (f.attrs.includes(term)) score += 12;
  }
  if (f.category.includes(q)) score += 35;
  if (f.tags.includes(q)) score += 30;
  if (f.attrs.includes(q)) score += 20;
  return score;
}
function isCodeLike(q) {
  const raw = String(q || '').trim();
  if (/\s/.test(raw)) return false;
  const compact = raw.replace(/-/g, '');
  return compact.length >= 4 && /^[a-z0-9]+$/i.test(compact) && /\d/.test(compact);
}
function exactCodeMatch(p, q) {
  const code = norm(q);
  if (!code) return false;
  if (norm(p.shortCode) === code) return true;
  if (norm(p.sku) === code) return true;
  if (norm(p.id) === code) return true;
  return Object.entries(p.variants || {}).some(([sku, v]) => norm(sku) === code || norm(v?.variantSku) === code);
}
function activeProducts(items) { return items.filter(p => String(p.status || '').toLowerCase() === 'active'); }
exports.search = async (text, options = {}) => {
  const q = norm(text);
  if (!q) return { items: [], exactCode: false, priceFilter: null };
  const items = activeProducts(await cache.getProducts());
  if (isCodeLike(q) || items.some(p => exactCodeMatch(p, q))) {
    const exact = items.filter(p => norm(p.shortCode) === q);
    if (exact.length) return { items: exact.slice(0, options.limit || 50), exactCode: true, priceFilter: null };
    const skuMatches = items.filter(p => norm(p.sku) === q);
    if (skuMatches.length) return { items: skuMatches.slice(0, options.limit || 50), exactCode: true, priceFilter: null };
    const variantMatches = items.filter(p => Object.entries(p.variants || {}).some(([sku, v]) => norm(sku) === q || norm(v?.variantSku) === q));
    if (variantMatches.length) return { items: variantMatches.slice(0, options.limit || 50), exactCode: true, priceFilter: null };
    const idMatches = items.filter(p => norm(p.id) === q);
    return { items: idMatches.slice(0, options.limit || 50), exactCode: true, priceFilter: null };
  }
  const priceFilter = parsePrice(text);
  const scored = items.filter(p => matchesPrice(p, priceFilter)).map(p => ({ p, score: scoreProduct(p, text) })).filter(x => x.score >= 12).sort((a, b) => b.score - a.score || Number(b.p.totalStock || 0) - Number(a.p.totalStock || 0));
  return { items: scored.slice(0, options.limit || 50).map(x => x.p), exactCode: false, priceFilter };
};
exports.findProducts = async text => (await exports.search(text)).items;
exports.byCategory = async id => {
  const items = await cache.getProducts();
  return items.filter(p => p.status === 'active' && (p.categoryPaths || p.categories || []).some(x => x.categoryId === id || x.subCategoryId === id || x.collectionId === id)).slice(0, 50);
};
exports.categories = () => cache.getTaxonomy();
exports.refresh = () => cache.refreshIfNeeded();
exports.getByCode = async code => {
  const items = activeProducts(await cache.getProducts());
  return items.find(p => exactCodeMatch(p, code)) || null;
};
exports.getById = id => cache.getById(id);
exports.normalizeQuery = norm;
exports.parsePrice = parsePrice;
exports.isProductSearchIntent = text => {
  const q = norm(text);
  if (parsePrice(text)) return true;
  if (SYNONYMS.some(([canonical, variants]) => q.includes(norm(canonical)) || variants.some(v => q.includes(norm(v))))) return true;
  return /fabric|fit|sleeve|color|colour|size|collection|category|product|পণ্য|কালার|রং|সাইজ|দাম|স্টক/.test(q);
};