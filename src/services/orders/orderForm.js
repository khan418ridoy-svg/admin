const {db}=require('../../config/firebase');
const catalog=require('../catalog/search');
const {normalizePhone}=require('../../utils/phone');
const verifier=require('../ai/verifier');
const {createOrder}=require('./createOrder');
const msgr=require('../../facebook/messenger');

async function submit(req,res){
 const {psid,name,phone,address,district,items,couponCode,paymentMethod='cod'}=req.body||{};
 const normalized=normalizePhone(phone);
 const method=['cod','bkash','sslcommerz'].includes(String(paymentMethod).toLowerCase())?String(paymentMethod).toLowerCase():'cod';
 if(!name||String(name).length>100||!normalized||!district||String(address||'').trim().length<10||!Array.isArray(items)||!items.length)
  return res.status(400).json({ok:false,error:'invalid_form'});
 let conv={messages:[]};
 if(psid){
  const convSnap=await db.doc(`conversations/${psid}`).get();
  if(!convSnap.exists)return res.status(403).json({ok:false,error:'unknown_conversation'});
  conv=convSnap.data();
 }
 const parsed=[];
 for(const i of items){
  const p=await catalog.getByCode(i.code);
  if(!p)return res.status(400).json({ok:false,error:'product_code_not_found'});
  parsed.push({productId:p.id,variantSku:i.variantSku,color:i.color,size:i.size,qty:i.qty});
 }
 const verification=await verifier.verify(conv.messages||[],{name,phone:normalized,address,district,items:parsed});
 if(verification.verdict==='suspected_spam'){
  if(psid)await db.doc(`conversations/${psid}`).set({needsAttention:true},{merge:true});
  return res.status(202).json({ok:true,status:'review'});
 }
 try{
  const order=await createOrder({customer:{name,phone:normalized,address,district},items:parsed,verification,conversationId:psid||null,idempotencyKey:req.get('idempotency-key'),couponCode:couponCode||null,source:'website',paymentMethod:method});
  if(psid)await msgr.text(psid,`ধন্যবাদ! আপনার অর্ডার ${order.orderNo} গ্রহণ করা হয়েছে। অর্ডারটি Pending আছে।`);
  return res.json({ok:true,status:'pending',orderNo:order.orderNo,subtotal:order.subtotal,discount:order.discount,deliveryCharge:order.deliveryCharge,total:order.total,paymentStatus:'unpaid',paymentNote:method==='cod'?'Cash on Delivery':'Payment gateway এখনো সংযুক্ত নয়; অর্ডার Pending থাকবে।'});
 }catch(e){return res.status(409).json({ok:false,error:e.message});}
}
module.exports={submit};