const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const { db, FieldValue, FieldPath } = require('../config/firebase');
const msgr = require('../facebook/messenger');
const { restoreAllocations, syncVariantTotals } = require('../services/inventory/stockLots');

router.use(adminAuth);

const FAILURE_REASONS = new Set(['phone_unreachable','customer_unavailable','customer_refused','wrong_address','courier_issue','other']);

const TRANSITIONS = {
  pending: ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'cancelled'],
  confirmed: ['processing', 'packed', 'shipped', 'out_for_delivery', 'cancelled'],
  processing: ['packed', 'shipped', 'out_for_delivery', 'cancelled'],
  packed: ['shipped', 'out_for_delivery', 'cancelled'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered', 'failed_delivery', 'returned'],
  failed_delivery: ['out_for_delivery', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: []
};

router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  let q = db.collection('orders').orderBy('createdAt', 'desc').limit(limit);
  if (req.query.source) q = q.where('source', '==', req.query.source);
  const snap = await q.get();
  res.json({ ok: true, items: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const snap = await db.doc(`orders/${req.params.id}`).get();
  if (!snap.exists) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, item: { id: snap.id, ...snap.data() } });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const nextStatus = String(req.body?.status || '').trim();
  const note = String(req.body?.note || '').trim().slice(0, 1000);
  const failureReason = String(req.body?.failureReason || '').trim();
  const returnReason = String(req.body?.returnReason || '').trim().slice(0, 500);
  const returnReceived = req.body?.returnReceived === true;

  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, nextStatus)) return res.status(400).json({ ok: false, error: 'invalid_status' });
  if (nextStatus === 'failed_delivery' && !FAILURE_REASONS.has(failureReason)) return res.status(400).json({ ok: false, error: 'failure_reason_required' });
  if (failureReason && !FAILURE_REASONS.has(failureReason)) return res.status(400).json({ ok: false, error: 'invalid_failure_reason' });
  if (nextStatus === 'returned' && !returnReason) return res.status(400).json({ ok: false, error: 'return_reason_required' });
  if (nextStatus === 'returned' && !returnReceived) return res.status(400).json({ ok: false, error: 'confirm_return_received' });

  const orderRef = db.doc(`orders/${req.params.id}`);
  const result = await db.runTransaction(async tx => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) { const err = new Error('not_found'); err.status = 404; throw err; }

    const order = orderSnap.data();
    const current = String(order.status || 'pending');
    if (current === nextStatus) return { unchanged: true, status: current };
    if (!(TRANSITIONS[current] || []).includes(nextStatus)) {
      const err = new Error(`invalid_transition:${current}->${nextStatus}`);
      err.status = 409; err.publicCode = `invalid_transition:${current}->${nextStatus}`; throw err;
    }

    if (nextStatus === 'cancelled' && current === 'failed_delivery' && !returnReceived) { const err = new Error('parcel_must_be_received_before_stock_release'); err.status = 409; throw err; }
    const shouldRelease = (nextStatus === 'returned' || (nextStatus === 'cancelled' && ['pending', 'confirmed', 'processing', 'packed'].includes(current)) || (nextStatus === 'cancelled' && current === 'failed_delivery' && returnReceived)) && order.stockReleased !== true;

    const items = Array.isArray(order.items) ? order.items : [];
    const productRefs = shouldRelease ? [...new Set(items.map(i => String(i.productId || '')).filter(Boolean))].map(id => db.doc(`products/${id}`)) : [];
    const productSnaps = [];
    for (const ref of productRefs) productSnaps.push(await tx.get(ref));

    let couponRef = null, couponSnap = null, couponClaimRef = null;
    if (shouldRelease && order.couponCode && order.couponReleased !== true) {
      couponRef = db.doc(`coupons/${String(order.couponCode).toUpperCase()}`);
      couponSnap = await tx.get(couponRef);
      if (order.couponPhoneClaimId) couponClaimRef = db.doc(`couponPhoneClaims/${order.couponPhoneClaimId}`);
    }

    const versionRef = db.doc('meta/catalogVersion');
    const versionSnap = shouldRelease ? await tx.get(versionRef) : null;
    const products = new Map(productSnaps.map(s => [s.id, s]));
    const stockDeltas = [];
    const workingProducts = new Map();
    if (shouldRelease) {
      for (const item of items) {
        const productId = String(item.productId || ''), variantSku = String(item.variantSku || '');
        const qty = Math.max(0, Math.floor(Number(item.qty) || 0));
        if (!productId || !variantSku || qty <= 0) continue;
        const productSnap = products.get(productId);
        if (!productSnap?.exists) { const err = new Error(`product_missing_during_stock_release:${productId}`); err.status = 409; throw err; }
        if (!workingProducts.has(productId)) {
          const data = productSnap.data() || {};
          workingProducts.set(productId, { ...data, variants: { ...(data.variants || {}) }, stockLots: Array.isArray(data.stockLots) ? data.stockLots.map(l => ({ ...l, quantities: { ...(l.quantities || {}) } })) : undefined });
        }
        const product = workingProducts.get(productId);
        if (!product.variants?.[variantSku]) { const err = new Error(`variant_missing_during_stock_release:${variantSku}`); err.status = 409; throw err; }
        const allocations = Array.isArray(item.stockAllocations) && item.stockAllocations.length
          ? item.stockAllocations
          : [{ lotId: `opening-${productId}`, lotNo: 'OPENING', qty }];
        product.stockLots = restoreAllocations(product, productId, variantSku, allocations);
        product.variants = syncVariantTotals(product, product.stockLots);
        stockDeltas.push({ productId, variantSku, qty });
      }
      for (const [productId, product] of workingProducts) {
        tx.update(db.doc(`products/${productId}`), {
          variants: product.variants, stockLots: product.stockLots || [],
          totalStock: Object.values(product.variants || {}).reduce((sum, v) => sum + Math.max(0, Number(v.stock) || 0), 0),
          updatedAt: Date.now()
        });
      }
    }

    if (stockDeltas.length) {
      let version = Number(versionSnap?.data()?.version || 0);
      const changes = Array.isArray(versionSnap?.data()?.changes) ? [...versionSnap.data().changes] : [];
      for (const id of [...new Set(stockDeltas.map(x => x.productId))]) { version++; changes.push({ version, id, deleted: false, at: Date.now() }); }
      tx.set(versionRef, { version, changes: changes.slice(-300), updatedAt: Date.now() }, { merge: true });
    }

    const now = Date.now();
    const historyEntry = { fromStatus: current, status: nextStatus, changedAt: now, changedBy: req.user.uid, note: note || null };
    if (nextStatus === 'failed_delivery') historyEntry.failureReason = failureReason;
    if (nextStatus === 'returned') historyEntry.returnReason = returnReason;
    const patch = { status: nextStatus, updatedAt: now, statusUpdatedAt: now, statusHistory: FieldValue.arrayUnion(historyEntry) };
    if (nextStatus === 'failed_delivery') { patch.failureReason = failureReason; patch.failureNote = note || null; }
    else if (nextStatus === 'returned') { patch.returnReason = returnReason; patch.returnedAt = now; patch.returnReceived = true; }
    else if (nextStatus === 'out_for_delivery') { patch.failureReason = FieldValue.delete(); patch.failureNote = FieldValue.delete(); }

    if (shouldRelease) {
      patch.stockReleased = true; patch.stockReleasedAt = now;
      if (couponRef && couponSnap?.exists) {
        const coupon = couponSnap.data() || {}; patch.couponReleased = true;
        const couponPatch = { usedCount: Math.max(0, Number(coupon.usedCount || 0) - 1), usedOrders: FieldValue.arrayRemove(orderRef.id), updatedAt: now };
        if (coupon.type === 'special') couponPatch.used = false;
        tx.update(couponRef, couponPatch);
        if (couponClaimRef) tx.delete(couponClaimRef);
      } else if (couponRef) patch.couponReleaseError = 'coupon_document_missing';
    }

    tx.update(orderRef, patch);
    return { unchanged: false, status: nextStatus, stockReleased: shouldRelease, stockReleasePending: patch.stockReleasePending === true, couponReleased: patch.couponReleased === true };
  });

  let customerNotification = 'not_applicable';
  if (!result.unchanged && result.status) {
    try {
      const latest = await orderRef.get(), order = latest.data() || {}, psid = String(order.conversationId || '');
      if (psid) {
        const convSnap = await db.doc(`conversations/${psid}`).get(), lastInboundAt = Number(convSnap.data()?.lastInboundAt || 0);
        if (lastInboundAt && Date.now() - lastInboundAt <= 24 * 60 * 60 * 1000) {
          const labels = { confirmed: 'আপনার অর্ডারটি Confirm করা হয়েছে।', processing: 'আপনার অর্ডারটি প্রস্তুত করা হচ্ছে।', packed: 'আপনার অর্ডারটি প্যাক করা হয়েছে।', shipped: 'আপনার অর্ডারটি কুরিয়ারে পাঠানো হয়েছে।', out_for_delivery: 'আপনার অর্ডারটি ডেলিভারির জন্য বের হয়েছে।', delivered: 'আপনার অর্ডারটি Delivered হয়েছে। ধন্যবাদ!', failed_delivery: 'আপনার অর্ডারটি ডেলিভারি করা যায়নি। আমাদের টিম আপনার সঙ্গে যোগাযোগ করবে।', returned: 'আপনার ফেরত আসা পার্সেলটি গ্রহণ করা হয়েছে।', cancelled: 'আপনার অর্ডারটি Cancel করা হয়েছে।' };
          const label = labels[result.status] || `আপনার অর্ডারের Status: ${result.status}`;
          await msgr.text(psid, `${order.customer?.name || 'প্রিয় Customer'}, ${label}\nOrder: ${order.orderNo || req.params.id}`);
          customerNotification = 'sent';
        } else customerNotification = 'outside_messaging_window';
      }
    } catch (notifyError) { customerNotification = 'failed'; console.warn('[order-status-notification]', req.params.id, notifyError.message); }
  }
  res.json({ ok: true, ...result, customerNotification });
}));

module.exports = router;