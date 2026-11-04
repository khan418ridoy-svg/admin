const router=require('express').Router();const adminAuth=require('../middleware/adminAuth');
const asyncHandler=require('../utils/asyncHandler');const {db}=require('../config/firebase');const msgr=require('../facebook/messenger');
router.use(adminAuth);
router.get('/conversations',asyncHandler(async(req,res)=>{const s=await db.collection('conversations').orderBy('updatedAt','desc').limit(100).get();res.json({ok:true,items:s.docs.map(d=>({id:d.id,...d.data()}))});}));
router.post('/conversations/refresh-profiles',asyncHandler(async(req,res)=>{
 const snap=await db.collection('conversations').orderBy('updatedAt','desc').limit(50).get();
 let updated=0,unavailable=0;
 for(const doc of snap.docs){
  const data=doc.data()||{};
  if(data.profileName)continue;
  try{const name=await msgr.getProfile(doc.id);if(name){await doc.ref.set({profileName:name,profileNameUpdatedAt:Date.now()},{merge:true});updated++;}else unavailable++;}
  catch(e){unavailable++;console.warn('[profile-refresh]',doc.id,e.message);}
 }
 res.json({ok:true,updated,unavailable});
}));
router.get('/config',asyncHandler(async(req,res)=>{const s=await db.doc('meta/botConfig').get();res.json({ok:true,config:s.data()||{enabled:false}});}));
router.put('/config',asyncHandler(async(req,res)=>{const allowed=['enabled','deliveryDhaka','deliveryOutside','notFoundMessage','captionTemplate'];const data={};for(const k of allowed)if(req.body[k]!==undefined)data[k]=req.body[k];data.updatedAt=Date.now();await db.doc('meta/botConfig').set(data,{merge:true});res.json({ok:true});}));
router.post('/conversations/:id/takeover',asyncHandler(async(req,res)=>{await db.doc(`conversations/${req.params.id}`).set({humanActive:true,needsAttention:false,updatedAt:Date.now()},{merge:true});res.json({ok:true});}));
router.post('/conversations/:id/resume',asyncHandler(async(req,res)=>{await db.doc(`conversations/${req.params.id}`).set({humanActive:false,updatedAt:Date.now()},{merge:true});res.json({ok:true});}));
router.post('/conversations/:id/block',asyncHandler(async(req,res)=>{await db.doc(`blocked/${req.params.id}`).set({psid:req.params.id,reason:req.body.reason||'admin_block',createdAt:Date.now()});res.json({ok:true});}));
router.post('/conversations/:id/unblock',asyncHandler(async(req,res)=>{await db.doc(`blocked/${req.params.id}`).delete();res.json({ok:true});}));
router.get('/notifications',asyncHandler(async(req,res)=>{
 const since=Math.max(0,Number(req.query.since)||Date.now()-60000);
 const [inboxSnap,orderSnap]=await Promise.all([
  db.collection('inboxMessages').where('createdAt','>',since).orderBy('createdAt','asc').limit(50).get(),
  db.collection('orders').where('createdAt','>',since).orderBy('createdAt','asc').limit(50).get()
 ]);
 const messages=inboxSnap.docs.map(d=>({id:d.id,type:'message',kind:d.data().kind||'incoming',title:'নতুন Facebook Message',body:String(d.data().text||'নতুন মেসেজ').slice(0,160),createdAt:Number(d.data().createdAt)||0})).filter(x=>x.kind==='incoming');
 const orders=orderSnap.docs.map(d=>{const o=d.data();return {id:d.id,type:'order',title:'নতুন Order',body:`${o.customer?.name||'Customer'} · ${o.orderNo||d.id} · ৳${o.total||0}`,createdAt:Number(o.createdAt)||0};});
 const items=[...messages,...orders].sort((a,b)=>a.createdAt-b.createdAt);
 res.json({ok:true,items,cursor:Math.max(since,...items.map(x=>x.createdAt))});
}));
router.get('/inbox',asyncHandler(async(req,res)=>{
 const limit=Math.min(Math.max(Number(req.query.limit)||100,1),200);
 const s=await db.collection('inboxMessages').orderBy('createdAt','desc').limit(200).get();
 let items=s.docs.map(d=>({id:d.id,...d.data()}));
 if(req.query.flagged==='true')items=items.filter(x=>x.flagged===true);
 res.json({ok:true,items:items.slice(0,limit)});
}));
router.post('/inbox/:id/flag',asyncHandler(async(req,res)=>{const ref=db.doc(`inboxMessages/${req.params.id}`);await ref.set({flagged:req.body.flagged!==false,flagReason:req.body.reason||'admin_review',flaggedAt:Date.now()},{merge:true});res.json({ok:true});}));
router.post('/inbox/:id/read-delete',asyncHandler(async(req,res)=>{await db.doc(`inboxMessages/${req.params.id}`).delete();res.json({ok:true,deleted:true});}));
router.post('/inbox/bulk-delete',asyncHandler(async(req,res)=>{const ids=[...new Set((req.body.ids||[]).map(String))].slice(0,400);const batch=db.batch();ids.forEach(id=>batch.delete(db.doc(`inboxMessages/${id}`)));await batch.commit();res.json({ok:true,deleted:ids.length});}));
router.post('/conversations/:id/reply',asyncHandler(async(req,res)=>{const text=String(req.body.text||'').trim().slice(0,1800);if(!text)return res.status(400).json({ok:false,error:'message_required'});const ref=db.doc(`conversations/${req.params.id}`),snap=await ref.get();if(!snap.exists)return res.status(404).json({ok:false,error:'conversation_not_found'});const last=Number(snap.data().lastInboundAt||0);if(!last||Date.now()-last>24*60*60*1000)return res.status(403).json({ok:false,error:'messaging_window_expired'});await msgr.text(req.params.id,text);await ref.set({humanActive:true,messages:require('firebase-admin').firestore.FieldValue.arrayUnion({role:'assistant',content:text,source:'admin',at:Date.now()}),updatedAt:Date.now()},{merge:true});const mid=`admin_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;await db.collection('inboxMessages').add({psid:req.params.id,mid,kind:'admin_reply',text,createdAt:Date.now(),read:false,flagged:false});res.json({ok:true});}));
module.exports=router;