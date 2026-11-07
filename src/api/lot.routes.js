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
  const snap = await db.collection('lots').orderBy('createdAt', 'desc').get();
  
  // প্রতিটি লটের স্টক এবং সেলস বের করা
  const lots = await Promise.all(snap.docs.map(async (doc) => {
    const lot = doc.data();
    const id = doc.id;

    // এই লটের অধীনে থাকা প্রোডাক্ট
    const productsSnap = await db.collection('products').where('lotId', '==', id).get();
    let totalBuyCost = 0;
    let currentStock = 0;
    let totalItems = 0;

    productsSnap.forEach(pDoc => {
      const p = pDoc.data();
      const cost = p.privateCost?.buyPrice || 0; // যদি ডেনরমালাইজ করা থাকে
      const stock = p.totalStock || 0;
      totalBuyCost += (cost * stock); // আনুমানিক
      currentStock += stock;
      totalItems += stock; 
    });

    // এই লটের অধীনে হওয়া সেলস (অর্ডার থেকে)
    // মনে রাখবেন: আপনার অর্ডারে items-এর ভেতরে lotId থাকতে হবে
    const ordersSnap = await db.collection('orders').where('status', 'in', ['delivered', 'completed']).get();
    let totalSell = 0;
    let soldItems = 0;
    
    ordersSnap.forEach(oDoc => {
      const o = oDoc.data();
      (o.items || []).forEach(item => {
        if (item.lotId === id) {
          totalSell += Number(item.unitPrice * item.qty);
          soldItems += Number(item.qty);
        }
      });
    });

    const daysPassed = Math.floor((Date.now() - lot.createdAt) / (1000 * 60 * 60 * 24));

    return {
      ...lot,
      id,
      productCount: productsSnap.size,
      totalBuyCost,
      totalSell,
      profit: totalSell - totalBuyCost,
      currentStock,
      soldItems,
      daysPassed
    };
  }));

  res.json({ ok: true, items: lots });
}));

// ৩. একটি নির্দিষ্ট লটের ডিটেইলস (ক্যাটাগরি ওয়াইজ প্রোডাক্ট)
router.get('/:id', asyncHandler(async (req, res) => {
  const lotRef = db.doc(`lots/${req.params.id}`);
  const lotSnap = await lotRef.get();
  if (!lotSnap.exists) return res.status(404).json({ ok: false, error: 'lot_not_found' });

  const productsSnap = await db.collection('products').where('lotId', '==', req.params.id).get();
  
  // ক্যাটাগরি অনুযায়ী গ্রুপ করা
  const categories = {};
  productsSnap.forEach(pDoc => {
    const p = pDoc.data();
    const catName = p.categoryName || 'Uncategorized';
    if (!categories[catName]) categories[catName] = [];
    categories[catName].push({ id: pDoc.id, ...p });
  });

  res.json({ ok: true, lot: { id: lotSnap.id, ...lotSnap.data() }, categories });
}));

module.exports = router;