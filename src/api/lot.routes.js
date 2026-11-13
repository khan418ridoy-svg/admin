const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const asyncHandler = require('../utils/asyncHandler');
const { db } = require('../config/firebase');
const costStore = require('../services/products/costStore'); // 🚨 costStore ইমপোর্ট করা হলো

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
  
  // 🚨 costStore থেকে সব কস্ট ১টি রিডে নিয়ে আসা
  const costData = await costStore.readAllCosts();
  const globalCosts = costData.items || {};

  const lots = await Promise.all(snap.docs.map(async (doc) => {
    const lot = doc.data();
    const id = doc.id;

    // এই লটের অধীনে থাকা প্রোডাক্ট
    const productsSnap = await db.collection('products').where('lotId', '==', id).get();
    let totalBuyCost = 0;
    let currentStock = 0;
    
    productsSnap.forEach(pDoc => {
      const p = pDoc.data();
      const stock = p.totalStock || 0;
      currentStock += stock;
      
      const pCost = globalCosts[pDoc.id] || {};
      const cost = Number(pCost.buyPrice || 0);
      totalBuyCost += (cost * stock); 
    });

    // এই লটের অধীনে হওয়া সেলস (অর্ডার থেকে)
    const ordersSnap = await db.collection('orders').get();
    let totalSell = 0;
    let totalProductCost = 0; 
    let soldItems = 0;
    
    ordersSnap.forEach(oDoc => {
      const o = oDoc.data();
      (o.items || []).forEach(item => {
        if (item.stockAllocations && Array.isArray(item.stockAllocations)) {
          item.stockAllocations.forEach(alloc => {
            if (alloc.lotId === id) {
              totalSell += Number(item.unitPrice * alloc.qty);
              soldItems += Number(alloc.qty);
              
              const pCost = globalCosts[item.productId] || {};
              const buyPrice = Number(pCost.variantBuyPrice?.[item.variantSku] || pCost.buyPrice || 0);
              totalProductCost += (buyPrice * Number(alloc.qty));
            }
          });
        } else if (item.lotId === id) {
          totalSell += Number(item.unitPrice * item.qty);
          soldItems += Number(item.qty);
          
          const pCost = globalCosts[item.productId] || {};
          const buyPrice = Number(pCost.variantBuyPrice?.[item.variantSku] || pCost.buyPrice || 0);
          totalProductCost += (buyPrice * Number(item.qty));
        }
      });
    });

    // আসল প্রফিট = মোট বিক্রি - বিক্রি হওয়া মালের ক্রয়মূল্য
    const profit = totalSell - totalProductCost;
    const daysPassed = Math.floor((Date.now() - lot.createdAt) / (1000 * 60 * 60 * 24));

    return {
      ...lot,
      id,
      productCount: productsSnap.size,
      stockCost: totalBuyCost, // 🚨 স্টক কস্ট
      totalSell,    
      totalProductCost, 
      profit,       
      currentStock,
      soldItems,
      daysPassed
    };
  }));

  res.json({ ok: true, items: lots });
}));

// ৩. একটি নির্দিষ্ট লটের ডিটেইলস (Category Breakdown)
router.get('/:id', asyncHandler(async (req, res) => {
  const lotRef = db.doc(`lots/${req.params.id}`);
  const lotSnap = await lotRef.get();
  if (!lotSnap.exists) return res.status(404).json({ ok: false, error: 'lot_not_found' });

  const productsSnap = await db.collection('products').where('lotId', '==', req.params.id).get();
  
  // 🚨 এখানেও কস্ট নিয়ে আসতে হবে, যাতে প্রোডাক্টের stockValue দেখানো যায়
  const costData = await costStore.readAllCosts();
  const globalCosts = costData.items || {};

  const categories = {};
  productsSnap.forEach(pDoc => {
    const p = pDoc.data();
    const catName = p.categoryName || 'Uncategorized';
    if (!categories[catName]) categories[catName] = [];
    
    // 🚨 প্রোডাক্টের স্টক ভ্যালু বের করা
    const pCost = globalCosts[pDoc.id] || {};
    const stockValue = (Number(pCost.buyPrice) || 0) * Number(p.totalStock || 0);
    
    categories[catName].push({ id: pDoc.id, ...p, stockValue });
  });

  res.json({ ok: true, lot: { id: lotSnap.id, ...lotSnap.data() }, categories });
}));

module.exports = router;
