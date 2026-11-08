const { db } = require('../config/firebase');
const { GRAPH_VERSION, SITE_URL } = require('../config/settings');
const catalog = require('../services/catalog/search');
const graph = `https://graph.facebook.com/${GRAPH_VERSION}`;
const PUBLIC_REPLY = 'স্যার, খুব দ্রুত আপনার সাথে যোগাযোগ করা হবে।';
const BAD_WORDS = ['fuck','shit','bitch','bastard','asshole','motherfucker','মাদারচোদ','চোদ','খানকি','বোকাচোদা','হারামজাদা'];

function isBadComment(value) {
 const text = String(value || '').toLowerCase().trim();
 if (!text) return true;
 if (BAD_WORDS.some(word => text.includes(word))) return true;
 // Obvious repeated-link / promotion spam is held for review rather than auto-replied.
 const links = (text.match(/https?:\/\//g) || []).length;
 if (links >= 2 || /(inbox me|whatsapp me|earn money|crypto signal|loan offer)/i.test(text)) return true;
 return false;
}
async function pageToken() {
 const snap = await db.doc('meta/privateFacebook').get();
 const token = snap.exists ? snap.data().pageAccessToken : process.env.META_PAGE_TOKEN;
 if (!token) throw new Error('meta_page_token_missing');
 return token;
}
async function graphPost(path, token, body) {
 const response = await fetch(`${graph}/${path}?access_token=${encodeURIComponent(token)}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000)
 });
 const data = await response.json().catch(() => ({}));
 if (!response.ok) throw new Error(data.error?.message || `meta_graph_${response.status}`);
 return data;
}
async function getPostText(postId, token) {
 const fields = encodeURIComponent('message,story,full_picture,permalink_url');
 const response = await fetch(`${graph}/${encodeURIComponent(postId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(10000) });
 const data = await response.json().catch(() => ({}));
 if (!response.ok) throw new Error(data.error?.message || `meta_post_${response.status}`);
 return `${data.message || ''}\n${data.story || ''}`;
}
function extractCode(text) {
 const matches = String(text || '').match(/\b[A-Z0-9][A-Z0-9_-]{3,24}\b/gi) || [];
 return matches.find(x => /[A-Z]/i.test(x) && /\d/.test(x)) || matches[0] || '';
}
function productDetails(p) {
 const price = Number(p.sellingPrice ?? p.baseSellingPrice ?? p.price ?? p.minPrice ?? 0);
 const colors = (p.availableColors || p.colors || []).slice(0, 8).join(', ');
 const sizes = (p.availableSizes || p.sizes || []).slice(0, 10).join(', ');
 const url = /^https:\/\//i.test(SITE_URL) && p.slug ? `${SITE_URL.replace(/\/$/, '')}/products/${encodeURIComponent(p.slug)}` : '';
 return [
  `🌸 Nishat Fashion — ${p.name || 'Product'}`,
  `Product Code: ${p.shortCode || p.sku || 'N/A'}`,
  price > 0 ? `Price: ৳${price.toLocaleString('en-BD')}` : '',
  colors ? `Available Color: ${colors}` : '',
  sizes ? `Available Size: ${sizes}` : '',
  Number(p.totalStock || 0) > 0 ? 'Stock: Available' : 'Stock: Please confirm with our team',
  url ? `Product Link: ${url}` : '',
  'অর্ডার করতে চাইলে আপনার পছন্দের Color ও Size লিখুন।'
 ].filter(Boolean).join('\n');
}
async function handleComment(change, pageId) {
 const value = change.value || {};
 if (String(value.item || '').toLowerCase() !== 'comment' || String(value.verb || '').toLowerCase() !== 'add') return;
 const commentId = String(value.comment_id || value.id || '');
 const commentText = String(value.message || '').trim();
 const fromId = String(value.from?.id || '');
 if (!commentId || !commentText || (fromId && fromId === String(pageId))) return;
 const eventRef = db.collection('facebookCommentEvents').doc(commentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140));
 try { await eventRef.create({ commentId, pageId: String(pageId), commentText, fromId, createdAt: Date.now(), status: 'processing' }); }
 catch (e) { if (e.code === 6 || e.code === 'already-exists' || String(e.message || '').includes('ALREADY_EXISTS')) return; throw e; }
 if (isBadComment(commentText)) {
  await eventRef.set({ status: 'skipped_moderation', moderation: 'bad_or_spam' }, { merge: true });
  return;
 }
 const token = await pageToken();
 // Public acknowledgement requested by the Page owner.
 await graphPost(`${encodeURIComponent(commentId)}/comments`, token, { message: PUBLIC_REPLY });
 let postText = '';
 const postId = String(value.post_id || '');
 if (postId) {
  try { postText = await getPostText(postId, token); }
  catch (e) { console.warn('[comment-automation] post lookup failed', e.message); }
 }
 const code = extractCode(`${postText}\n${commentText}`);
 let product = null;
 if (code) {
  try { product = await catalog.getByCode(code); }
  catch (e) { console.warn('[comment-automation] catalog lookup failed', e.message); }
 }
 const privateMessage = product
  ? productDetails(product)
  : 'স্যার, আপনার পছন্দের পণ্যটি নিশ্চিতভাবে শনাক্ত করতে পারিনি। অনুগ্রহ করে পোস্টে থাকা Product Code-টি Inbox-এ লিখুন, আমরা বিস্তারিত পাঠিয়ে দেব।';
 try {
  await graphPost(`${encodeURIComponent(commentId)}/private_replies`, token, { message: privateMessage });
  await eventRef.set({ status: publicReplyOk ? 'replied' : 'private_replied_public_failed', productId: product?.id || null, productCode: code || null, repliedAt: Date.now() }, { merge: true });
 } catch (e) {
  await eventRef.set({ status: 'public_replied_private_failed', error: e.message, productId: product?.id || null }, { merge: true });
  console.error('[comment-automation] private reply failed', commentId, e.message);
 }
}
module.exports = { handleComment, isBadComment };
