const {db}=require('../config/firebase');
const catalog=require('../services/catalog/search');
const chain=require('../services/ai/chatChain');
const msgr=require('./messenger');
const prompts=require('./prompts');
const verifier=require('../services/ai/verifier');
const {createOrder}=require('../services/orders/createOrder');
const {normalizePhone}=require('../utils/phone');
const {HISTORY_LIMIT,SITE_URL}=require('../config/settings');

const safe=(v,n=100)=>String(v||'').trim().slice(0,n);
const uniq=a=>[...new Set(a.filter(Boolean))];
const makePayload=(...p)=>p.join('|');

function classify(text){
 const t=String(text||'').trim();
 if(!t)return 'empty';
 if(/[ঀ-৿]/.test(t)||/[A-Za-z]/.test(t)||/^\d+$/.test(t))return 'supported';
 return 'unknown';
}
function badLanguage(text){
 const t=String(text||'').toLowerCase();
 const words=['fuck','shit','bitch','bastard','asshole','motherfucker','মাদারচোদ','চোদ','হারামজাদা','খানকি','বোকাচোদা'];
 return words.some(w=>t.includes(w));
}
async function saveConversation(ref,conv,extra={}){
 await ref.set({...conv,...extra,messages:(conv.messages||[]).slice(-HISTORY_LIMIT),updatedAt:Date.now()},{merge:true});
}
async function inbox(psid,mid,kind,text,extra={}){
 const id=Buffer.from(`${psid}:${mid}:${kind}`).toString('base64url').slice(0,140);
 await db.collection('inboxMessages').doc(id).set({psid,mid,kind,text:typeof text==='string'?text:(text&&typeof text==='object'?String(text.text||text.message||text.body||text.content||JSON.stringify(text)):String(text||'')),createdAt:Date.now(),read:false,flagged:false,...extra},{merge:true});
}
async function sendAndLog(psid,conv,text,kind='assistant'){
 await msgr.text(psid,text);
 conv.messages=[...(conv.messages||[]),{role:'assistant',content:text,at:Date.now()}].slice(-HISTORY_LIMIT);
 await inbox(psid,`out_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,kind,text,{senderName:conv.profileName||''});
 await saveConversation(db.doc(`conversations/${psid}`),conv);
}
async function sendOptions(psid,text,opts){return msgr.quickReplies(psid,text,opts.slice(0,10));}
function flattenCategories(collections){
 const out=[];
 for(const c of collections||[]) for(const k of c.categories||[]) out.push({id:k.id,name:k.name,collectionName:c.name});
 return out;
}
async function sendWelcome(psid){
 const cats=flattenCategories(await catalog.categories());
 const choices=cats.slice(0,10).map(c=>({title:String(c.name).slice(0,20),payload:`CAT|${c.id}`}));
 const greeting='আসসালামু আলাইকুম! 🌸\nনিশাত ফ্যাশনে আপনাকে স্বাগতম।\n\nআমাদের কালেকশনে রয়েছে বিভিন্ন ধরনের ফ্যাশনেবল পোশাক। আপনি কী ধরনের পণ্য খুঁজছেন?';
 if(choices.length) return sendOptions(psid,greeting,choices.concat([{title:'সব পণ্য',payload:'MENU|SHOP'}]).slice(0,10));
 return msgr.postbackButtons(psid,greeting,[{title:'সব পণ্য দেখুন',payload:'MENU|SHOP'}]);
}
function isGreeting(text){
 const t=String(text||'').toLowerCase().trim();
 return /^(hi|hello|hey|হাই|হ্যালো|আসসালামু ?আলাইকুম|সালাম|কি কি আছে|কী কী আছে|কি আছে|কী আছে|show products|what do you have|products)$/i.test(t);
}
async function sendProductCards(psid,products){
 const publicSite=/^https:\/\//i.test(SITE_URL)?SITE_URL.replace(/\/$/,''):null;
 const elements=products.slice(0,10).map(p=>({
  title:p.name,
  subtitle:`Code: ${p.shortCode||p.sku||'—'} · ৳${Number(p.sellingPrice??p.price??p.minPrice??0).toLocaleString('en-BD')} · ${Number(p.totalStock||0)>0?(p.stockStatus==='low_stock'?'Low stock':'In stock'):'Out of stock'}`,
  ...(p.mainImage?{image_url:p.mainImage}:{}),
  buttons:[
   ...(Number(p.totalStock||0)>0?[{type:'postback',title:'Choose options',payload:`BUY|${p.id}`}]:[]),
   ...(publicSite&&p.slug?[{type:'web_url',title:'View website',url:`${publicSite}/products/${encodeURIComponent(p.slug)}`}]:[])
  ]
 }));
 await msgr.generic(psid,elements);
}
async function sendSearchPage(psid,conv,offset=0){
 const ids=Array.isArray(conv.searchResultIds)?conv.searchResultIds:[];
 const pageIds=ids.slice(offset,offset+10);
 const products=(await Promise.all(pageIds.map(id=>catalog.getById(id)))).filter(Boolean).filter(p=>p.status==='active');
 if(!products.length)return msgr.text(psid,'আর কোনো Matching Product পাওয়া যায়নি।');
 await sendProductCards(psid,products);
 const next=offset+10;
 if(next<ids.length)return msgr.quickReplies(psid,`আরও ${ids.length-next}টি Matching Product রয়েছে।`,[{title:'আরও পণ্য দেখুন',payload:`SEARCH|MORE|${next}`}]);
 return undefined;
}
function colorIcon(color){
 const c=String(color||'').toLowerCase();
 if(/red|লাল/.test(c))return '🔴'; if(/blue|নীল/.test(c))return '🔵';
 if(/green|সবুজ/.test(c))return '🟢'; if(/black|কালো/.test(c))return '⚫';
 if(/white|সাদা/.test(c))return '⚪'; if(/yellow|হলুদ/.test(c))return '🟡';
 if(/pink|গোলাপি/.test(c))return '🌸'; if(/orange|কমলা/.test(c))return '🟠';
 if(/purple|বেগুনি/.test(c))return '🟣'; if(/gray|grey|ধূসর/.test(c))return '⚪';
 return '🎨';
}
async function showOutOfStock(psid,p){
 return msgr.postbackButtons(psid,`দুঃখিত, ${p.name} বর্তমানে Stock-এ নেই। একই ধরনের পণ্য দেখতে পারেন, অথবা Stock ফিরলে জানাতে বলুন।`,[
  {title:'Restock হলে জানান',payload:`RESTOCK|${p.id}`},{title:'Similar products',payload:`RELATED|${p.id}`},{title:'Main menu',payload:'MENU|SHOP'}
 ]);
}
async function showColors(psid,p){
 const variants=Object.entries(p.variants||{}).filter(([sku,v])=>v.isActive!==false&&Number(v.stock)>0);
 const colors=[...new Set(variants.map(([sku,v])=>String(v.color||'').trim()).filter(Boolean))];
 if(!colors.length)return showOutOfStock(psid,p);
 return sendOptions(psid,`${p.name} — Available Color নির্বাচন করুন:`,colors.slice(0,10).map(color=>({title:`${colorIcon(color)} ${color}`.slice(0,20),payload:makePayload('COLOR',p.id,encodeURIComponent(color))})));
}
async function showSizes(psid,p,color){
 const variants=Object.entries(p.variants||{}).filter(([sku,v])=>v.isActive!==false&&Number(v.stock)>0&&String(v.color||'')===color);
 if(!variants.length)return msgr.text(psid,'এই Color-এর কোনো Size এখন Stock-এ নেই।');
 const sizes=[...new Map(variants.map(([sku,v])=>[String(v.size),{size:String(v.size),sku}])).values()];
 return sendOptions(psid,`${colorIcon(color)} ${color} — Available Size নির্বাচন করুন:`,sizes.slice(0,10).map(v=>({title:v.size.slice(0,20),payload:makePayload('SIZE',p.id,encodeURIComponent(color),encodeURIComponent(v.size))})));
}
async function showCart(psid,conv){
 const cart=conv.cart||[];
 if(!cart.length)return msgr.postbackButtons(psid,'আপনার Cart খালি। পণ্য খুঁজতে নিচের Button চাপুন।',[{title:'Shop products',payload:'MENU|SHOP'}]);
 const lines=cart.map((x,i)=>`${i+1}. ${x.name} · ${x.color}/${x.size} × ${x.qty} = ৳${x.unitPrice*x.qty}`).join('\n');
 const total=cart.reduce((n,x)=>n+x.unitPrice*x.qty,0);
 return msgr.postbackButtons(psid,`আপনার Cart:\n${lines}\n\nSubtotal: ৳${total}\nআরও পণ্য যোগ বা Checkout করুন।`,[{title:'Add more',payload:'MENU|SHOP'},{title:'Checkout',payload:'CHECKOUT'},{title:'Clear cart',payload:'CART|CLEAR'}]);
}
async function checkoutPrompt(psid,conv){
 const step=conv.checkout?.step||'name';
 const prompts={
  name:'অর্ডার করতে আপনার পূর্ণ নাম লিখুন।',
  phone:'আপনার মোবাইল নম্বর লিখুন। উদাহরণ: 01XXXXXXXXX',
  address:'আপনার সম্পূর্ণ ঠিকানা লিখুন (বাসা/রোড/এলাকা)।',
  district:'আপনার জেলা লিখুন।'
 };
 const back=step==='name'?[]:[{title:'⬅️ Back',payload:'ORDER|BACK'}];
 return msgr.quickReplies(psid,prompts[step]||prompts.name,[...back,{title:'❌ Cancel / Exit',payload:'ORDER|CANCEL'}]);
}
async function beginCheckout(psid,conv){
 if(!(conv.cart||[]).length)return msgr.text(psid,'আগে অন্তত একটি Product Cart-এ যোগ করুন।');
 conv.checkout={step:'name',customer:{},startedAt:Date.now()};
 await saveConversation(db.doc(`conversations/${psid}`),conv);
 return checkoutPrompt(psid,conv);
}
async function finishOrder(psid,conv){
 const c=conv.checkout?.customer||{};
 if(!c.name||!c.phone||!c.address||!c.district)return msgr.text(psid,'কিছু তথ্য বাকি আছে। আবার Checkout চাপুন।');
 const verification=await verifier.verify(conv.messages||[],{...c,items:conv.cart||[],consent:true});
 let order;
 try{
  order=await createOrder({customer:c,items:conv.cart.map(x=>({productId:x.productId,variantSku:x.variantSku,color:x.color,size:x.size,qty:x.qty})),verification,conversationId:psid,idempotencyKey:`messenger-${psid}-${conv.checkout.startedAt}`});
 }catch(e){
  conv.checkout.step='review';
  await saveConversation(db.doc(`conversations/${psid}`),conv,{needsAttention:true});
  return msgr.text(psid,`অর্ডার তৈরি করা যায়নি: ${e.message}। অনুগ্রহ করে Admin-এর সঙ্গে যোগাযোগ করুন।`);
 }
 const itemLines=(conv.cart||[]).map((x,i)=>`${i+1}. ${x.name} (${x.color||'—'}/${x.size||'—'}) × ${x.qty} = ৳${Number(x.unitPrice||0)*Number(x.qty||0)}`).join('\n');
 const msg=`ধন্যবাদ ${c.name}! আপনার অর্ডার ${order.orderNo} গ্রহণ করা হয়েছে।\n\nঅর্ডারের বিবরণ:\n${itemLines}\n\nSubtotal: ৳${order.subtotal||conv.cart.reduce((n,x)=>n+x.unitPrice*x.qty,0)}\nDelivery Charge: ৳${order.deliveryCharge||0}\nDiscount: ৳${Number(order.discount||0)}\nTotal Payable: ৳${order.total||0}\n\nVerification: ${verification.verdict==='ok'?'প্রাথমিকভাবে যাচাইকৃত':'Admin Review প্রয়োজন'}\nOrder Status: Pending\nআমাদের প্রতিনিধি প্রয়োজনীয় যাচাই শেষে আপনার অর্ডার Confirm করবেন।`;
 conv.cart=[];conv.checkout=null;conv.flow=null;
 await saveConversation(db.doc(`conversations/${psid}`),conv,{needsAttention:verification.verdict!=='ok',lastOrderId:order.id,lastOrderNo:order.orderNo});
 await sendAndLog(psid,conv,msg,'order_confirmation');
}
function checkoutIntent(text){
 const t=String(text||'').trim().toLowerCase();
 return /^(?:cancel|stop|exit|না|নাহ|বাতিল|ক্যানসেল|বাদ দিন|আর নিব না|আর নেব না|নিবো না|নেব না|কিনব না|লাগবে না|চাই না)$/i.test(t) ||
  /\b(?:cancel|stop|exit|don't want|dont want|won't take|wont take|not buying|no thanks|nibo na|nebo na|kinbo na|lagbe na)\b/i.test(t) ||
  /(?:নিবো না|নেব না|কিনব না|অর্ডার করব না|অর্ডার করবো না|লাগবে না|চাই না|বাতিল)/i.test(t);
}
function looksLikeCheckoutQuestion(text){
 return /\?|কেন|কিভাবে|কীভাবে|কত|কখন|ডেলিভারি|delivery|price|দাম|stock|স্টক|available|কোথায়|কোথায়/i.test(String(text||''));
}
async function cancelCheckout(psid,conv){
 conv.checkout=null;conv.pendingItem=null;
 await saveConversation(db.doc(`conversations/${psid}`),conv);
 return msgr.postbackButtons(psid,'Checkout বাতিল করা হয়েছে। আপনার Cart-এর পণ্যগুলো রাখা হয়েছে।',[{title:'আবার Checkout',payload:'CHECKOUT'},{title:'Cart দেখুন',payload:'CART|SHOW'},{title:'আরও পণ্য দেখুন',payload:'MENU|SHOP'}]);
}
async function handleCheckoutInput(psid,text,conv){
 const raw=String(text||'').trim();
 if(checkoutIntent(raw))return cancelCheckout(psid,conv);
 const step=conv.checkout?.step||'name';
 if(looksLikeCheckoutQuestion(raw)){
  const history=(conv.messages||[]).slice(-HISTORY_LIMIT);
  try{
   const categories=flattenCategories(await catalog.categories());
   await msgr.senderAction(psid,'typing_on');
   const result=await chain.reply([{role:'system',content:prompts.system([],categories,conv.customerName||'')},...history,{role:'user',content:raw}]);
   await msgr.quickReplies(psid,`${result.text}\n\nCheckout চালিয়ে যেতে আগের তথ্য দিন, অথবা বাতিল করুন।`,[
    ...(step==='name'?[]:[{title:'⬅️ Back',payload:'ORDER|BACK'}]),
    {title:'❌ Cancel / Exit',payload:'ORDER|CANCEL'}
   ]);
   return;
  }catch(e){return checkoutPrompt(psid,conv);}
 }
 const customer=conv.checkout.customer||{};
 if(step==='name'){
  const name=safe(raw,100);
  if(name.length<2||/\b(?:cancel|stop|exit|nibo na|nebo na|no thanks)\b|নিবো না|নেব না|বাতিল/i.test(name)){
   return msgr.quickReplies(psid,'সঠিক পূর্ণ নাম লিখুন, অথবা Checkout বাতিল করুন।',[{title:'❌ Cancel / Exit',payload:'ORDER|CANCEL'}]);
  }
  customer.name=name;conv.checkout.customer=customer;conv.checkout.step='phone';
 }else if(step==='phone'){
  const phone=normalizePhone(raw);
  if(!phone)return msgr.quickReplies(psid,'সঠিক মোবাইল নম্বর দিন। উদাহরণ: 01XXXXXXXXX',[{title:'⬅️ Back',payload:'ORDER|BACK'},{title:'❌ Cancel / Exit',payload:'ORDER|CANCEL'}]);
  customer.phone=phone;conv.checkout.customer=customer;conv.checkout.step='address';
 }else if(step==='address'){
  const address=safe(raw,400);
  if(address.length<8)return msgr.quickReplies(psid,'সম্পূর্ণ ঠিকানা লিখুন (বাসা/রোড/এলাকা)।',[{title:'⬅️ Back',payload:'ORDER|BACK'},{title:'❌ Cancel / Exit',payload:'ORDER|CANCEL'}]);
  customer.address=address;conv.checkout.customer=customer;conv.checkout.step='district';
 }else if(step==='district'){
  const district=safe(raw,60);
  if(district.length<2)return msgr.quickReplies(psid,'জেলার নাম লিখুন।',[{title:'⬅️ Back',payload:'ORDER|BACK'},{title:'❌ Cancel / Exit',payload:'ORDER|CANCEL'}]);
  customer.district=district;conv.checkout.customer=customer;conv.checkout.step='confirm';
  const subtotal=conv.cart.reduce((n,x)=>n+x.unitPrice*x.qty,0);
  const delivery=['dhaka','ঢাকা'].includes(district.trim().toLowerCase())?Number(process.env.DELIVERY_DHAKA||80):Number(process.env.DELIVERY_OUTSIDE||130);
  await saveConversation(db.doc(`conversations/${psid}`),conv);
  return msgr.postbackButtons(psid,`অর্ডারটি Confirm করবেন?\nনাম: ${customer.name}\nফোন: ${customer.phone}\nঠিকানা: ${customer.address}\nজেলা: ${district}\nSubtotal: ৳${subtotal}\nDelivery: ৳${delivery}\nPayment: Cash on Delivery`,[
   {title:'Confirm order',payload:'ORDER|CONFIRM'},{title:'Edit details',payload:'ORDER|EDIT'},{title:'Cancel',payload:'ORDER|CANCEL'}
  ]);
 }else{
  return checkoutPrompt(psid,conv);
 }
 await saveConversation(db.doc(`conversations/${psid}`),conv);
 return checkoutPrompt(psid,conv);
}
async function handle({psid,text,payload,mid,senderName=''}){
 const ref=db.doc(`conversations/${psid}`),snap=await ref.get();
 const conv=snap.data()||{messages:[],cart:[]};conv.messages=conv.messages||[];conv.cart=conv.cart||[];if(senderName&&!conv.profileName)conv.profileName=senderName;
 const blocked=await db.doc(`blocked/${psid}`).get();if(blocked.exists||conv.humanActive)return;
 const envEnabled=String(process.env.BOT_ENABLED||'').toLowerCase();
 const cfg=(await db.doc('meta/botConfig').get()).data()||{};
 if(envEnabled==='false'||cfg.enabled!==true)return;
 if(conv.profileName)await ref.set({profileName:conv.profileName,profileNameUpdatedAt:Date.now()},{merge:true});
 await catalog.refresh();
 const content=safe(text,2000);
 if(content) {
  conv.messages=[...conv.messages,{role:'user',content,at:Date.now()}].slice(-HISTORY_LIMIT);
  conv.lastInboundAt=Date.now();
  await inbox(psid,mid||`m_${Date.now()}`,'incoming',content,{receivedAt:Date.now(),senderName:conv.profileName||senderName||''});
  await ref.set({lastInboundAt:conv.lastInboundAt,updatedAt:Date.now()},{merge:true});
 }
 if(content&&/\b(refund|complaint|human|admin|agent|representative)\b|ফেরত|অভিযোগ|মানুষের সাথে|এডমিন/i.test(content)){
  await inbox(psid,mid||`m_${Date.now()}`,'human_handoff',content,{flagged:true,flagReason:'human_requested'});
  const handoffReply='আপনার অনুরোধটি আমাদের প্রতিনিধির কাছে পাঠানো হয়েছে। আমাদের প্রতিনিধি শীঘ্রই আপনার সাথে যোগাযোগ করবেন।';
  conv.messages=[...conv.messages,{role:'assistant',content:handoffReply,source:'human_handoff',at:Date.now()}].slice(-HISTORY_LIMIT);
  await saveConversation(ref,conv,{humanActive:true,needsAttention:true,humanRequestedAt:Date.now(),humanRequestReason:'customer_requested'});
  await inbox(psid,`handoff_${Date.now()}`,'human_handoff_notice',handoffReply,{senderName:conv.profileName||''});
  return msgr.text(psid,handoffReply);
 }
 if(content&&badLanguage(content)){
  await inbox(psid,mid||`m_${Date.now()}`,'incoming',content,{flagged:true,flagReason:'bad_language'});await saveConversation(ref,conv,{needsAttention:true,moderation:{reason:'bad_language',at:Date.now()}});
  return msgr.text(psid,'আপনার Message-টি আমাদের টিম Review করবে। অনুগ্রহ করে ভদ্র ভাষায় লিখুন।');
 }
 if(content&&classify(content)==='unknown'){
  await inbox(psid,mid||`m_${Date.now()}`,'incoming',content,{flagged:true,flagReason:'unsupported_language'});await saveConversation(ref,conv,{needsAttention:true,moderation:{reason:'unsupported_language',at:Date.now()}});
  return msgr.text(psid,'দুঃখিত, আপাতত বাংলা বা English-এ লিখুন।');
 }
 if(conv.checkout?.step&&content&&!payload){
  if(checkoutIntent(content))return cancelCheckout(psid,conv);
  return handleCheckoutInput(psid,content,conv);
 }
 if(payload){
  const parts=String(payload).split('|'),action=parts[0];
  if(action==='SEARCH'&&parts[1]==='MORE'){
   return sendSearchPage(psid,conv,Math.max(0,Number(parts[2])||0));
  }
  if(action==='MENU'&&parts[1]==='SHOP'){
   conv.checkout=null;conv.flow=null;await saveConversation(ref,conv,{lastInboundAt:Date.now()});
   const cats=await catalog.categories();const choices=[];
   for(const c of cats)for(const k of (c.categories||[]))choices.push({title:k.name,payload:`CAT|${k.id}`});
   return sendOptions(psid,'কোন Category দেখতে চান?',choices.slice(0,10));
  }
  if(action==='RESTOCK'){
   const productId=String(parts[1]||'');
   await db.doc(`restockWatchers/${productId}_${psid}`).set({productId,psid,createdAt:Date.now()},{merge:true});
   return msgr.text(psid,'ঠিক আছে! পণ্যটি আবার Stock-এ এলে আপনাকে Messenger-এ জানানো হবে।');
  }
  if(action==='RELATED'){
   const p=await catalog.getById(parts[1]);
   const categoryId=p?.categoryPaths?.[0]?.categoryId||p?.categories?.[0]?.categoryId;
   const related=categoryId?(await catalog.byCategory(categoryId)).filter(x=>x.id!==p.id).slice(0,5):[];
   if(related.length)return sendProductCards(psid,related);
   return msgr.text(psid,'এই মুহূর্তে একই Category-তে বিকল্প পণ্য পাওয়া যায়নি। Main menu থেকে অন্য পণ্য দেখতে পারেন।');
  }
  if(action==='CAT'){
   const products=await catalog.byCategory(parts[1]);
   if(!products.length)return msgr.text(psid,'এই Category-তে এখন পণ্য পাওয়া যাচ্ছে না।');
   return sendProductCards(psid,products);
  }
  if(action==='BUY'){
   const p=await catalog.getById(parts[1]);if(!p)return msgr.text(psid,'পণ্যটি আর Available নেই।');
   conv.flow={step:'color',productId:p.id};await saveConversation(ref,conv);
   return showColors(psid,p);
  }
  if(action==='COLOR'){
   const p=await catalog.getById(parts[1]);if(!p)return msgr.text(psid,'পণ্যটি আর Available নেই।');
   const color=decodeURIComponent(parts[2]);
   const stillAvailable=Object.values(p.variants||{}).some(v=>v.isActive!==false&&Number(v.stock)>0&&String(v.color||'')===color);
   if(!stillAvailable)return showOutOfStock(psid,p);
   conv.flow={step:'size',productId:p.id,color};await saveConversation(ref,conv);
   return showSizes(psid,p,color);
  }
  if(action==='SIZE'){
   const p=await catalog.getById(parts[1]);if(!p)return msgr.text(psid,'পণ্যটি আর Available নেই।');
   const color=decodeURIComponent(parts[2]),size=decodeURIComponent(parts[3]);
   const found=Object.entries(p.variants||{}).find(([sku,v])=>v.color===color&&v.size===size&&v.isActive!==false&&Number(v.stock)>0);
   if(!found)return showOutOfStock(psid,p);
   const [variantSku,v]=found;conv.pendingItem={productId:p.id,variantSku,name:p.name,color,size,unitPrice:Number(v.sellingPrice)>0?Number(v.sellingPrice):Number(p.baseSellingPrice||p.sellingPrice||p.minPrice||0),stock:Number(v.stock)};
   conv.flow={step:'quantity',productId:p.id,variantSku};
   await saveConversation(ref,conv);
   return sendOptions(psid,`${p.name} · ${color}/${size}\nদাম: ৳${conv.pendingItem.unitPrice}\nকতটি নিতে চান?`,[1,2,3,4,5].filter(n=>n<=conv.pendingItem.stock).map(n=>({title:String(n),payload:`QTY|${n}`})));
  }
  if(action==='QTY'){
   const qty=Math.max(1,Math.min(5,Number(parts[1])||1));if(!conv.pendingItem)return msgr.text(psid,'আগে Product, Color ও Size নির্বাচন করুন।');
   if(qty>conv.pendingItem.stock)return msgr.text(psid,'এই পরিমাণ Stock-এ নেই।');
   conv.pendingItem.qty=qty;conv.cart.push(conv.pendingItem);conv.pendingItem=null;conv.flow=null;
   await saveConversation(ref,conv);
   return showCart(psid,conv);
  }
  if(action==='CART'&&parts[1]==='CLEAR'){conv.cart=[];await saveConversation(ref,conv);return msgr.text(psid,'Cart খালি করা হয়েছে।');}
  if(action==='CHECKOUT')return beginCheckout(psid,conv);
  if(action==='ORDER'&&parts[1]==='CANCEL')return cancelCheckout(psid,conv);
  if(action==='ORDER'&&parts[1]==='BACK'){const order=['name','phone','address','district'];const i=order.indexOf(conv.checkout?.step||'name');conv.checkout.step=order[Math.max(0,i-1)];await saveConversation(ref,conv);return checkoutPrompt(psid,conv);}
  if(action==='ORDER'&&parts[1]==='CONTINUE'){
   const step=conv.checkout?.step||'name';
   const prompts={name:'আপনার পূর্ণ নাম লিখুন।',phone:'আপনার মোবাইল নম্বর লিখুন। উদাহরণ: 01XXXXXXXXX',address:'আপনার সম্পূর্ণ ঠিকানা লিখুন।',district:'আপনার জেলা লিখুন।',details:'এক মেসেজে নাম, ফোন, ঠিকানা ও জেলা লিখুন।',confirm:'আপনার অর্ডারটি Confirm বা Edit করতে নিচের Button ব্যবহার করুন।'};
   return msgr.text(psid,prompts[step]||'Checkout চালিয়ে যেতে প্রয়োজনীয় তথ্য লিখুন।');
  }
  if(action==='CART'&&parts[1]==='SHOW')return showCart(psid,conv);
  if(action==='ORDER'&&parts[1]==='EDIT'){conv.checkout.step='name';conv.checkout.customer={};await saveConversation(ref,conv);return checkoutPrompt(psid,conv);}
  if(action==='ORDER'&&parts[1]==='CONFIRM'){
   if(conv.checkout?.step!=='confirm')return msgr.text(psid,'Order confirmation session পাওয়া যায়নি। আবার Checkout করুন।');
   const order=await finishOrder(psid,conv);return order;
  }
 }
 if(!content)return;
 if(isGreeting(content)) return sendWelcome(psid);
 const searchResult=await catalog.search(content,{limit:50});
 const found=searchResult.items;
 if(found.length){
  conv.searchResultIds=found.map(p=>p.id);
  conv.searchQuery=content;
  await saveConversation(ref,conv);
  return sendSearchPage(psid,conv,0);
 }
 if(catalog.isProductSearchIntent(content))return msgr.text(psid,prompts.notFound);
 if(/cart|কার্ট/i.test(content))return showCart(psid,conv);
 if(/order|অর্ডার/i.test(content))return beginCheckout(psid,conv);
 const history=(conv.messages||[]).slice(-HISTORY_LIMIT);
 try{
  const categories=flattenCategories(await catalog.categories());
  await msgr.senderAction(psid,'typing_on');
  const result=await chain.reply([{role:'system',content:prompts.system(found,categories,conv.customerName||'')},...history,{role:'user',content:content}]);
  await sendAndLog(psid,conv,result.text,'ai_reply');
 }catch(e){
  await saveConversation(ref,conv,{needsAttention:true,lastError:e.message});
  return msgr.text(psid,prompts.handoff);
 }
}
module.exports={handle};