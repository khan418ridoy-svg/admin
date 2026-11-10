const {db,FieldValue,FieldPath}=require('../../config/firebase');
const settings=require('../../config/settings');
const { allocateStock, syncVariantTotals } = require('../inventory/stockLots');
async function createOrder({customer,items,verification,conversationId,idempotencyKey,couponCode,source='facebook',paymentMethod='cod'}){
 if(!Array.isArray(items)||!items.length)throw new Error('empty_order');
 if(source==='facebook'&&couponCode)throw new Error('messenger_coupon_not_allowed');
 if(idempotencyKey){
  const prior=await db.collection('orders').where('idempotencyKey','==',idempotencyKey).limit(1).get();
  if(!prior.empty){const d=prior.docs[0].data()||{};return {id:prior.docs[0].id,orderNo:d.orderNo,subtotal:d.subtotal,discount:d.discount,deliveryCharge:d.deliveryCharge,total:d.total,duplicate:true};}
 }
 const orderRef=db.collection('orders').doc();
 return db.runTransaction(async tx=>{
  const counterRef=db.doc('meta/counters'),cfgRef=db.doc('meta/botConfig'),publicRef=db.doc('meta/publicSettings');
  const versionRef=db.doc('meta/catalogVersion');
  const couponRef=couponCode?db.doc(`coupons/${String(couponCode).trim().toUpperCase()}`):null;
  const phoneClaimRef=couponRef?db.doc(`couponPhoneClaims/${String(customer.phone||'').replace(/\D/g,'')}_${String(couponCode).trim().toUpperCase()}`):null;
  const reads=[tx.get(counterRef),tx.get(cfgRef),tx.get(publicRef),tx.get(versionRef),...items.map(i=>tx.get(db.doc(`products/${i.productId}`)))];
  if(couponRef)reads.push(tx.get(couponRef),tx.get(phoneClaimRef));
  const snapshots=await Promise.all(reads);
  const [counterSnap,cfgSnap,publicSnap,versionSnap,...rest]=snapshots;
  const productSnaps=rest.slice(0,items.length);
  const couponSnap=couponRef?rest[items.length]:null;
  const phoneClaimSnap=phoneClaimRef?rest[items.length+1]:null;
  let subtotal=0;const lines=[];const workingProducts=new Map();
  for(let n=0;n<items.length;n++){
   const snap=productSnaps[n];const original=snap.data();if(!original||original.status!=='active')throw new Error('product_unavailable');
   const item=items[n];
   if(!workingProducts.has(snap.id)) workingProducts.set(snap.id, { ...original, variants: { ...(original.variants || {}) }, stockLots: Array.isArray(original.stockLots) ? original.stockLots.map(l => ({ ...l, quantities: { ...(l.quantities || {}) } })) : undefined });
   const p=workingProducts.get(snap.id);
   const found=Object.entries(p.variants||{}).find(([sku,v])=>(sku===item.variantSku||(v.color===item.color&&v.size===item.size))&&v.isActive!==false);
   if(!found)throw new Error('variant_unavailable');
   const [sku,v]=found,qty=Math.max(1,Math.min(5,Number(item.qty)||1));
   const { stockLots, allocations } = allocateStock(p, snap.id, sku, qty);
   p.stockLots = stockLots;
   p.variants = syncVariantTotals(p, stockLots);
   const price=Number(v.sellingPrice)>0?Number(v.sellingPrice):Number(p.baseSellingPrice||p.sellingPrice||p.minPrice||0);
   if(!Number.isFinite(price)||price<=0)throw new Error('invalid_price');
   const regular=Number(v.regularPrice)>0?Number(v.regularPrice):Number(p.baseRegularPrice||p.regularPrice||price);
   subtotal+=price*qty;
   lines.push({productId:item.productId,variantSku:sku,lotId: allocations[0]?.lotId || null,stockAllocations: allocations.map(a => ({ ...a, createdAt: (stockLots.find(l => l.lotId === a.lotId)?.createdAt || 0) })),name:p.name,slug:p.slug||'',shortCode:p.shortCode||'',color:v.color,size:v.size,qty,unitPrice:price,regularPrice:regular,lineTotal:price*qty});
  }
  const cfg = cfgSnap.data() || {};
  const pub = publicSnap.data() || {};
  const isDhaka = ['dhaka', 'ঢাকা'].includes(
  String(customer?.district || '').trim().toLowerCase()
);
  
  // ১. ডিফল্ট ডেলিভারি চার্জ
  let deliveryCharge = Number(isDhaka ? (pub.deliveryDhaka ?? cfg.deliveryDhaka ?? settings.DELIVERY_DHAKA) : (pub.deliveryOutside ?? cfg.deliveryOutside ?? settings.DELIVERY_OUTSIDE));

  // ২. Dynamic Delivery Rules চেক করা (সাবটোটালের ওপর ভিত্তি করে)
  const deliveryRules = Array.isArray(pub.deliveryRules) ? pub.deliveryRules : [];
  const now = Date.now();
  
  // যে রুলগুলো এখনো এক্সপায়ার হয়নি, সেগুলো ফিল্টার করা
  const activeRules = deliveryRules.filter(r => !r.expiry || r.expiry > now);
  
  // যে রুলগুলো সাবটোটালের চেয়ে কম বা সমান, সেগুলো বের করে বড় থেকে ছোট সাজানো (যাতে সবচেয়ে বড় ডিসকাউন্ট আগে পায়)
  const applicableRules = activeRules.filter(r => subtotal >= Number(r.minAmount || 0)).sort((a, b) => Number(b.minAmount) - Number(a.minAmount));

  if (applicableRules.length > 0) {
    const bestRule = applicableRules[0]; // সবচেয়ে বেশি এমাউন্টের রুল
    if (bestRule.type === 'free') {
      deliveryCharge = 0; // ফ্রি ডেলিভারি
    } else if (bestRule.type === 'percent') {
      const discountAmount = Math.floor(deliveryCharge * (Number(bestRule.value) / 100));
      deliveryCharge = Math.max(0, deliveryCharge - discountAmount); // ডেলিভারি চার্জ থেকে ডিসকাউন্ট বাদ
    }
  }
  let couponDiscount=0,coupon=null;
  if(couponRef){
   coupon=couponSnap?.data();
   const now=Date.now(),phone=String(customer.phone||'').replace(/\D/g,'');
   if(!coupon||coupon.active!==true)throw new Error('coupon_invalid');
   if(coupon.expiresAt&&Number(coupon.expiresAt)<now)throw new Error('coupon_expired');
   if(subtotal<Number(coupon.minPurchase||0))throw new Error('coupon_minimum_not_met');
   if(Number(coupon.usedCount||0)>=Number(coupon.usageLimit||Number.MAX_SAFE_INTEGER))throw new Error('coupon_limit_reached');
   if(coupon.type==='special'){
    if(String(coupon.targetPhone||'').replace(/\D/g,'')!==phone)throw new Error('coupon_phone_mismatch');
    if(coupon.used===true)throw new Error('coupon_already_used');
   }else if(coupon.type==='general'){
    if(phoneClaimSnap?.exists)throw new Error('coupon_slab_already_used');
   }else throw new Error('coupon_type_invalid');
   const eligible=Number(coupon.discountPercent||0);
   if(!(eligible>0&&eligible<=100))throw new Error('coupon_invalid_discount');
   couponDiscount=Math.min(subtotal*eligible/100,Number(coupon.maxDiscount||Number.MAX_SAFE_INTEGER));
   couponDiscount=Math.max(0,Math.floor(couponDiscount));
  }
  const next=(counterSnap.data()?.order||0)+1,orderNo=`NF-${String(next).padStart(6,'0')}`;
  tx.set(counterRef,{order:next},{merge:true});
  const changedIds=[...new Set(items.map(i=>String(i.productId)))];
  for (const [productId, product] of workingProducts) {
   tx.update(db.doc(`products/${productId}`), { variants: product.variants, stockLots: product.stockLots || [] , totalStock: Object.values(product.variants || {}).reduce((sum, v) => sum + Math.max(0, Number(v.stock) || 0), 0), updatedAt: Date.now() });
  }
  let version=Number(versionSnap.data()?.version||0);
  const changes=Array.isArray(versionSnap.data()?.changes)?[...versionSnap.data().changes]:[];
  for(const id of changedIds){version++;changes.push({version,id,deleted:false,at:Date.now()});}
  tx.set(versionRef,{version,changes:changes.slice(-300),updatedAt:Date.now()},{merge:true});
  if(couponRef){
   const couponPatch={usedCount:FieldValue.increment(1),usedOrders:FieldValue.arrayUnion(orderRef.id),updatedAt:Date.now()};
   if(coupon.type==='special')couponPatch.used=true;
   tx.update(couponRef,couponPatch);
   if(coupon.type==='general')tx.create(phoneClaimRef,{phone:customer.phone,couponCode:String(couponCode).toUpperCase(),orderId:orderRef.id,createdAt:Date.now()});
  }
  const total=Math.max(0,subtotal-couponDiscount)+deliveryCharge;
const isPos = source === 'pos';

tx.create(orderRef, {
  orderNo,
  source,
  status: isPos ? 'completed' : 'pending',
  paymentMethod,
  paymentStatus: isPos ? 'paid' : 'unpaid',
  customer,
  items: lines,
  subtotal,
  couponCode: couponRef ? String(couponCode).trim().toUpperCase() : null,
  couponPhoneClaimId: (couponRef && coupon?.type === 'general')
    ? `${String(customer.phone || '').replace(/\D/g, '')}_${String(couponCode).trim().toUpperCase()}`
    : null,
  discount: couponDiscount,
  deliveryCharge,
  total,
  botCreated: source === 'facebook',
needsReview: source === 'pos'
  ? false
  : verification?.verdict !== 'ok',
  verification: verification || null,
  conversationId: conversationId || null,
  idempotencyKey: idempotencyKey || null,
  createdAt: Date.now(),
  updatedAt: Date.now()
});
  return {orderNo,id:orderRef.id,subtotal,discount:couponDiscount,deliveryCharge,total};
 });
}
module.exports={createOrder};
