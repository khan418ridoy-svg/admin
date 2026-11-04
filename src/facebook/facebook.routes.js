const router = require('express').Router();
const crypto = require('crypto');
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const { db } = require('../config/firebase');
const { GRAPH_VERSION } = require('../config/settings');

const graph = `https://graph.facebook.com/${GRAPH_VERSION}`;
const scopes = (process.env.META_SCOPES || 'pages_show_list,pages_manage_metadata,pages_messaging,pages_read_engagement').split(',').map(x => x.trim()).filter(Boolean).join(',');
// Sets the Messenger "Get Started" button and the always-visible persistent menu (Home / New products / My orders / Cart).
async function setupMessengerProfile(token) {
  const site = (process.env.SITE_URL || '').replace(/\/$/, '');
  const menu = [
    { type: 'postback', title: '🏠 হোম', payload: 'MENU|HOME' },
    { type: 'postback', title: '🆕 নতুন পণ্য', payload: 'MENU|NEW' },
    { type: 'postback', title: '📦 আমার অর্ডার', payload: 'MENU|ORDERS' },
    { type: 'postback', title: '🛒 আমার Cart', payload: 'CART|SHOW' },
    ...(/^https:\/\//i.test(site) ? [{ type: 'web_url', title: '🌐 ওয়েবসাইট', url: site }] : [])
  ];
  try {
    const r = await fetch(`${graph}/me/messenger_profile?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        get_started: { payload: 'GET_STARTED' },
        persistent_menu: [{ locale: 'default', composer_input_disabled: false, call_to_actions: menu }]
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) {
      console.error('[facebook] messenger_profile setup failed', d.error?.message || r.status);
      return { ok: false, error: d.error?.message || `Meta API ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[facebook] messenger_profile setup error', e.message);
    return { ok: false, error: e.message };
  }
}
const callbackUrl = () => `${(process.env.SITE_URL || '').replace(/\/$/, '')}/api/facebook/callback`;

router.get('/start', adminAuth, asyncHandler(async (req, res) => {
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET || !process.env.SITE_URL) return res.status(503).json({ error: 'META_APP_ID, META_APP_SECRET and public SITE_URL must be configured on the server.' });
  const now = Date.now();
  const stale = await db.collection('facebookOAuthStates').where('createdAt', '<', now - 10 * 60 * 1000).limit(400).get();
  const batch = db.batch();
  stale.docs.forEach(doc => batch.delete(doc.ref));
  if (!stale.empty) await batch.commit();
  const usedStates = await db.collection('facebookOAuthStates').where('used', '==', true).limit(200).get();
  if (!usedStates.empty) {
    const cleanup = db.batch();
    usedStates.docs.forEach(doc => cleanup.delete(doc.ref));
    await cleanup.commit();
  }
  const state = crypto.randomBytes(32).toString('hex');
  await db.collection('facebookOAuthStates').doc(state).set({ uid: req.user.uid, createdAt: now, used: false });
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', process.env.META_APP_ID);
  url.searchParams.set('redirect_uri', callbackUrl());
  url.searchParams.set('state', state);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('response_type', 'code');
  res.json({ url: url.toString() });
}));

router.get('/callback', asyncHandler(async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  const fail = (message) => res.status(400).send(`<h2>Facebook connection failed</h2><p>${String(message).replace(/[<>&"']/g, '')}</p><p>Close this tab and retry from Admin → Facebook Settings.</p>`);
  if (error) return fail(errorDescription || error);
  if (!code || !state || !/^[a-f0-9]{64}$/.test(state)) return fail('Invalid OAuth response.');
  const stateRef = db.collection('facebookOAuthStates').doc(state);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists || stateSnap.data().used || Date.now() - stateSnap.data().createdAt > 10 * 60 * 1000) return fail('Login state expired. Please reconnect.');
  await stateRef.update({ used: true });
  const params = new URLSearchParams({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: callbackUrl(), code: String(code) });
  const shortResponse = await fetch(`${graph}/oauth/access_token?${params}`);
  const shortData = await shortResponse.json();
  if (!shortResponse.ok || !shortData.access_token) return fail(shortData.error?.message || 'Could not obtain user token.');
  const longParams = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: shortData.access_token });
  const longResponse = await fetch(`${graph}/oauth/access_token?${longParams}`);
  const longData = await longResponse.json();
  if (!longResponse.ok || !longData.access_token) return fail(longData.error?.message || 'Could not exchange long-lived user token.');
  const pageResponse = await fetch(`${graph}/me/accounts?fields=id,name,access_token,tasks&limit=100&access_token=${encodeURIComponent(longData.access_token)}`);
  const pageData = await pageResponse.json();
  if (!pageResponse.ok) return fail(pageData.error?.message || 'Could not load Facebook Pages.');
  const pages = (pageData.data || []).map(p => ({ id: p.id, name: p.name, accessToken: p.access_token, tasks: p.tasks || [] }));
  await db.collection('facebookConnections').doc(stateSnap.data().uid).set({
    connected: true, userAccessToken: longData.access_token,
    userTokenExpiresAt: longData.expires_in ? Date.now() + longData.expires_in * 1000 : null,
    pages, selectedPageId: null, connectedAt: Date.now(), updatedAt: Date.now()
  }, { merge: true });
  res.send(`<h2>Facebook account connected</h2><p>${pages.length} Page(s) found. Return to Admin → Facebook Settings and select a Page.</p><script>setTimeout(()=>window.close(),1800)</script>`);
}));

router.get('/status', adminAuth, asyncHandler(async (req, res) => {
  const snap = await db.collection('facebookConnections').doc(req.user.uid).get();
  if (!snap.exists) return res.json({ connected: false, pages: [], selectedPageId: null });
  const d = snap.data();
  res.json({ connected: !!d.connected, pages: (d.pages || []).map(p => ({ id: p.id, name: p.name, tasks: p.tasks })), selectedPageId: d.selectedPageId || null, connectedAt: d.connectedAt, userTokenExpiresAt: d.userTokenExpiresAt });
}));

router.post('/select-page', adminAuth, asyncHandler(async (req, res) => {
  const pageId = String(req.body.pageId || '');
  const ref = db.collection('facebookConnections').doc(req.user.uid);
  const snap = await ref.get();
  if (!snap.exists) return res.status(400).json({ error: 'Connect Facebook first.' });
  const page = (snap.data().pages || []).find(p => p.id === pageId);
  if (!page) return res.status(404).json({ error: 'Page not found in this Facebook connection.' });
  const subscribeParams = new URLSearchParams({ subscribed_fields: 'messages,messaging_postbacks', access_token: page.accessToken });
  const subscribeResponse = await fetch(`${graph}/${encodeURIComponent(page.id)}/subscribed_apps`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: subscribeParams
  });
  const subscribeData = await subscribeResponse.json().catch(() => ({}));
  if (!subscribeResponse.ok || subscribeData.success === false) {
    return res.status(502).json({
      error: 'Could not subscribe selected Facebook Page to Messenger webhooks.',
      details: subscribeData.error?.message || `Meta API ${subscribeResponse.status}`
    });
  }
  await ref.set({ selectedPageId: page.id, pageId: page.id, pageName: page.name, pageAccessToken: page.accessToken, updatedAt: Date.now() }, { merge: true });
  await db.doc('meta/privateFacebook').set({
    pageId: page.id, pageName: page.name, pageAccessToken: page.accessToken,
    webhookSubscribed: true, webhookSubscribedFields: ['messages', 'messaging_postbacks'], updatedAt: Date.now()
  });
  console.log(`[facebook] Active Messenger Page selected: ${page.name} (${page.id}); webhook subscribed.`);
  const profile = await setupMessengerProfile(page.accessToken);
  res.json({ ok: true, page: { id: page.id, name: page.name }, webhookSubscribed: true, menuConfigured: profile.ok, menuError: profile.error });
}));

// Re-apply Get Started + persistent menu to the currently selected Page (use after changing menu items).
router.post('/setup-menu', adminAuth, asyncHandler(async (req, res) => {
  const active = await db.doc('meta/privateFacebook').get();
  if (!active.exists || !active.data().pageAccessToken) return res.status(400).json({ error: 'Select a Facebook Page first.' });
  const profile = await setupMessengerProfile(active.data().pageAccessToken);
  if (!profile.ok) return res.status(502).json({ error: 'Could not configure Messenger menu.', details: profile.error });
  res.json({ ok: true });
}));

router.post('/disconnect', adminAuth, asyncHandler(async (req, res) => {
  await db.collection('facebookConnections').doc(req.user.uid).delete();
  const active = await db.doc('meta/privateFacebook').get();
  if (active.exists) await db.doc('meta/privateFacebook').delete();
  res.json({ ok: true });
}));
module.exports = router;