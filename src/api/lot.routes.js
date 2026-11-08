const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const { db } = require('../config/firebase');

router.use(adminAuth);

// ১. নতুন লট তৈরি করা
router.post('/', asyncHandler(async (req, res) => {
  const { lotNo, date, note } = req.body;
  if (!lotNo) return res.status(400).json({ ok: false, error: 'lot_no_required' });
  
  const id = lotNo.toUpperCase().replace(/[^A-Z0-9]/g, '-');
  const ref = db.doc(`lots/${id}`);
  const snap = await ref.get();
  if (snap.exists) return res.status(409).json({ ok: false, error: 'lot_already_exists' });

  await ref.set({
    lotNo: id,
    createdAt: date ? new Date(date).getTime() : Date.now(),
    note: note || '',
    status: 'active',
    updatedAt: Date.now()
  });
  res.status(201).json({ ok: true, id });
}));

// ২. সব লটের লিস্ট (মোট কেনা, স্টক, লাভসহ)
router.get('/', asyncHandler(async (req, res) => {
  const [lotSnap, productSnap, ordersSnap, costsSnap] = await Promise.all([
    db.collection('lots').orderBy('createdAt', 'desc').get(),
    db.collection('products').get(),
    db.collection('orders').where('status', 'in', ['delivered', 'completed']).get(),
    db.collection('productCosts').get()
  ]);
  const costs = new Map(costsSnap.docs.map(d => [d.id, d.data() || {}]));
  const lots = lotSnap.docs.map(doc => {
    const lot = doc.data() || {}, id = doc.id;
    let totalBuyCost = 0, currentStock = 0, productCount = 0;
    const productIds = new Set();
    productSnap.docs.forEach(pDoc => {
      const p = pDoc.data() || {};
      const allocation = (p.stockLots || []).find(x => String(x.lotId) === id);
      const legacyMatch = p.lotId === id && !Array.isArray(p.stockLots);
      if (!allocation && !legacyMatch) return;
      productIds.add(pDoc.id);
      const quantities = allocation?.quantities || {};
      for (const [sku, qty0] of Object.entries(quantities)) {
        const qty = Math.max(0, Number(qty0) || 0);
        currentStock += qty;
        const variantCost = Number(costs.get(pDoc.id)?.variantBuyPrice?.[sku] || costs.get(pDoc.id)?.buyPrice || 0);
        totalBuyCost += variantCost * qty;
      }
      if (legacyMatch) {
        const qty = Number(p.totalStock || 0);
        currentStock += qty;
        totalBuyCost += Number(costs.get(pDoc.id)?.buyPrice || 0) * qty;
      }
    });
    productCount = productIds.size;
    let totalSell = 0, soldItems = 0;
    ordersSnap.docs.forEach(oDoc => {
      for (const item of oDoc.data()?.items || []) {
        const allocations = Array.isArray(item.stockAllocations) ? item.stockAllocations : [];
        const soldFromLot = allocations.filter(a => String(a.lotId) === id);
        for (const allocation of soldFromLot) {
          const qty = Number(allocation.qty || 0);
          soldItems += qty;
          totalSell += Number(item.unitPrice || 0) * qty;
        }
        if (!allocations.length && item.lotId === id) {
          soldItems += Number(item.qty || 0);
          totalSell += Number(item.unitPrice || 0) * Number(item.qty || 0);
        }
      }
    });
    const createdAt = Number(lot.createdAt || 0);
    return {
      ...lot, id, productCount, totalBuyCost, totalSell,
      profit: totalSell - totalBuyCost, currentStock, soldItems,
      daysPassed: createdAt ? Math.max(0, Math.floor((Date.now() - createdAt) / 86400000)) : 0
    };
  });
  res.json({ ok: true, items: lots });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const lotRef = db.doc(`lots/${req.params.id}`);
  const lotSnap = await lotRef.get();
  if (!lotSnap.exists) return res.status(404).json({ ok: false, error: 'lot_not_found' });
  const productsSnap = await db.collection('products').get();
  const categories = {};
  productsSnap.forEach(pDoc => {
    const p = pDoc.data() || {};
    const allocation = (p.stockLots || []).find(x => String(x.lotId) === req.params.id);
    const legacyMatch = p.lotId === req.params.id && !Array.isArray(p.stockLots);
    if (!allocation && !legacyMatch) return;
    const catName = p.categoryName || 'Uncategorized';
    const lotStock = allocation
      ? Object.values(allocation.quantities || {}).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0)
      : Number(p.totalStock || 0);
    if (!categories[catName]) categories[catName] = [];
    categories[catName].push({ id: pDoc.id, ...p, totalStock: lotStock, lotQuantities: allocation?.quantities || {} });
  });
  res.json({ ok: true, lot: { id: lotSnap.id, ...lotSnap.data() }, categories });
}));

module.exports = router;