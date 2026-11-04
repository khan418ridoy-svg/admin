const router=require('express').Router();
const asyncHandler=require('../utils/asyncHandler');
const adminAuth=require('../middleware/adminAuth');
const {db}=require('../config/firebase');
const {normalizePhone}=require('../utils/phone');

router.get('/validate',asyncHandler(async(req,res)=>{
 const code=String(req.query.code||'').trim().toUpperCase();
 const phone=normalizePhone(req.query.phone);
 const subtotal=Math.max(0,Number(req.query.subtotal)||0);
 if(!code)return res.status(400).json({ok:false,error:'code_required'});
 const snap=await db.doc(`coupons/${code}`).get(),c=snap.data();
 if(!snap.exists||c.active!==true)return res.status(404).json({ok:false,error:'coupon_invalid'});
 if(c.expiresAt&&Number(c.expiresAt)<Date.now())return res.status(400).json({ok:false,error:'coupon_expired'});
 if(subtotal<Number(c.minPurchase||0))return res.status(400).json({ok:false,error:'coupon_minimum_not_met',minPurchase:Number(c.minPurchase||0)});
 if(Number(c.usedCount||0)>=Number(c.maximumUses??c.usageLimit??Number.MAX_SAFE_INTEGER))return res.status(400).json({ok:false,error:'coupon_limit_reached'});
 if(c.type==='special'&&(String(c.targetPhone||'').replace(/\D/g,'')!==String(phone||'').replace(/\D/g,'')||Number(c.usedCount||0)>=Number(c.usageLimit||1)))return res.status(400).json({ok:false,error:'coupon_not_eligible'});
 if(c.type==='general'&&phone){
  const claim=await db.doc(`couponPhoneClaims/${String(phone).replace(/\D/g,'')}_${code}`).get();
  if(claim.exists)return res.status(400).json({ok:false,error:'coupon_already_used_by_customer'});
 }
 const discount=Math.max(0,Math.floor(Math.min(subtotal*Number(c.discountPercent||0)/100,Number(c.maxDiscount||Number.MAX_SAFE_INTEGER))));
 res.json({ok:true,coupon:{code,type:c.type,discountPercent:Number(c.discountPercent),discount,maxDiscount:Number(c.maxDiscount||0),minPurchase:Number(c.minPurchase||0)}});
}));
router.use(adminAuth);
router.get('/',asyncHandler(async(req,res)=>{
 const type=['general','special'].includes(req.query.type)?req.query.type:null;
 const limit=Math.min(Math.max(Number(req.query.limit)||50,1),100);
 let q=db.collection('coupons').orderBy('updatedAt','desc').limit(limit);
 if(type)q=q.where('type','==',type);
 const snap=await q.get();
 res.json({ok:true,items:snap.docs.map(d=>({code:d.id,...d.data()}))});
}));
router.get('/:code/collections',asyncHandler(async(req,res)=>{
 const limit=Math.min(Math.max(Number(req.query.limit)||50,1),100);
 const snap=await db.collection(`couponCollections/${String(req.params.code).toUpperCase()}/users`).orderBy('collectedAt','desc').limit(limit).get();
 res.json({ok:true,items:snap.docs.map(d=>({customerId:d.id,...d.data()}))});
}));
router.post('/',asyncHandler(async(req,res)=>{
 const b=req.body||{},code=String(b.code||'').trim().toUpperCase();
 const type=b.type==='special'?'special':'general';
 const discountPercent=Number(b.discountPercent),maxDiscount=Number(b.maxDiscount),minPurchase=Number(b.minPurchase);
 const maximumUses=Math.max(1,Math.floor(Number(b.maximumUses??b.usageLimit)||1000));
 const initialCount=type==='general'?Math.max(0,Math.floor(Number(b.initialCount)||0)):0;
 if(type==='general'&&initialCount>maximumUses)return res.status(400).json({ok:false,error:'initial_count_exceeds_maximum_uses'});
 if(!/^[A-Z0-9_-]{3,40}$/.test(code)||!(discountPercent>0&&discountPercent<=100)||maxDiscount<0||minPurchase<0)
  return res.status(400).json({ok:false,error:'invalid_coupon'});
 const targetPhone=type==='special'?normalizePhone(b.targetPhone):null;
 if(type==='special'&&!targetPhone)return res.status(400).json({ok:false,error:'invalid_target_phone'});
 const usageLimit=type==='special'?Math.max(1,Math.floor(Number(b.usageLimit)||1)):maximumUses;
 const ref=db.doc(`coupons/${code}`);
 if((await ref.get()).exists)return res.status(409).json({ok:false,error:'coupon_code_exists'});
 const now=Date.now();
 const data={type,active:true,discountPercent,maxDiscount,minPurchase,expiresAt:b.expiresAt?new Date(b.expiresAt).getTime():null,
  maximumUses,usageLimit,initialCount,claimedCount:initialCount,usedCount:0,collectedCount:0,actualCollectedCount:0,used:false,targetPhone,updatedAt:now,createdAt:now};
 await ref.create(data);
 res.status(201).json({ok:true,code});
}));
router.patch('/:code',asyncHandler(async(req,res)=>{
 const code=String(req.params.code||'').trim().toUpperCase();
 const ref=db.doc(`coupons/${code}`),snap=await ref.get();
 if(!snap.exists)return res.status(404).json({ok:false,error:'coupon_not_found'});
 const current=snap.data()||{},body=req.body||{},patch={updatedAt:Date.now()};
 if(body.type!==undefined&&body.type!==current.type)return res.status(400).json({ok:false,error:'coupon_type_immutable'});
 for(const key of ['discountPercent','maxDiscount','minPurchase']){
  if(body[key]!==undefined){
   const n=Number(body[key]);
   if(!Number.isFinite(n)||n<0||(key==='discountPercent'&&(n<=0||n>100)))return res.status(400).json({ok:false,error:`invalid_${key}`});
   patch[key]=n;
  }
 }
 if(current.type==='general'&&body.maximumUses!==undefined){
  const n=Math.floor(Number(body.maximumUses));
  if(!Number.isFinite(n)||n<1||n<Number(current.claimedCount??current.initialCount??0))return res.status(400).json({ok:false,error:'invalid_maximum_uses'});
  patch.maximumUses=n;patch.usageLimit=n;
 }
 if(current.type==='general'&&body.initialCount!==undefined){
  const n=Math.floor(Number(body.initialCount));
  const actual=Number(current.collectedCount||current.actualCollectedCount||0);
  const max=Number(body.maximumUses??current.maximumUses??Number.MAX_SAFE_INTEGER);
  if(!Number.isFinite(n)||n<0||n+actual>max)return res.status(400).json({ok:false,error:'invalid_initial_count'});
  patch.initialCount=n;patch.claimedCount=n+actual;
 }
 if(current.type==='special'){
  if(body.targetPhone!==undefined){
   const phone=normalizePhone(body.targetPhone);
   if(!phone)return res.status(400).json({ok:false,error:'invalid_target_phone'});
   patch.targetPhone=phone;
  }
  if(body.usageLimit!==undefined){
   const n=Math.floor(Number(body.usageLimit));
   if(!Number.isFinite(n)||n<1||n<Number(current.usedCount||0))return res.status(400).json({ok:false,error:'invalid_usage_limit'});
   patch.usageLimit=n;patch.maximumUses=n;
  }
 }
 if(body.expiresAt!==undefined){
  const expiry=body.expiresAt?new Date(body.expiresAt).getTime():null;
  if(body.expiresAt&&(!Number.isFinite(expiry)))return res.status(400).json({ok:false,error:'invalid_expiry'});
  patch.expiresAt=expiry;
 }
 if(typeof body.active==='boolean')patch.active=body.active;
 await ref.set(patch,{merge:true});
 res.json({ok:true,code});
}));
module.exports=router;