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
const makePayload=(...p)=>p.join('|');
const taka=n=>`৳${Number(n||0).toLocaleString('en-BD')}`;
const ms=v=>{
 if(!v)return 0;
 if(typeof v==='number')return v;
 if(typeof v.toMillis==='function')return v.toMillis();
 if(v._seconds!=null)return v._seconds*1000;
 const t=Date.parse(v);return Number.isNaN(t)?0:t;
};
const fmtDate=t=>t?new Date(t).toLocaleDateString('en-GB',{timeZone:'Asia/Dhaka',day:'2-digit',month:'short',year:'numeric'}):'';

/* ---------- Intent matchers ---------- */
const HOME_RE=/^(menu|home|main menu|start|মেনু|হোম|মেইন মেনু|প্রথম পেজ|প্রথম পেইজ|হোম পেজ|শুরু)$/i;
const ORDERS_RE=/(my|amar|amr)\s*orders?\b|orders?\s*(status|track\w*|kothay|kothai)|track\s*(my\s*)?order|আমার\s*অর্ডার|অর্ডার\s*(স্ট্যাটাস|কোথায়|ট্র্যাক\w*|জানতে|দেখ\w*|কী\s*হলো|কি\s*হলো|এর\s*অবস্থা)|অর্ডারের\s*(অবস্থা|খবর|স্ট্যাটাস|তথ্য)/i;
const NEW_RE=/new\s*(product|arrival|collection|item)s?|latest\s*(product|collection)|notun\s*(product|collection)|নতুন\s*(পণ্য|প্রডাক্ট|প্রোডাক্ট|কালেকশন|আইটেম)|নতুন\s*(কী|কি)\s*(এসেছে|আছে)|নতুন\s*এসেছে/i;
const CART_RE=/^(my\s*)?cart(\s*(dekhao|dekhi))?$|^(আমার\s*)?কার্ট(\s*দেখ\w*)?$/i;

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

const NAV=[
 {title:'🏠 Home',payload:'MENU|HOME'},
 {title:'🛒 Cart',payload:'CART|SHOW'},
 {title:'📦 আমার অর্ডার',payload:'MENU|ORDERS'}
];
async function sendWithButtons(psid,text,buttons){
 if(String(text).length<=620)return msgr.postbackButtons(psid,text,buttons);
 await msgr.text(psid,text);
 return msgr.postbackButtons(psid,'এখন কী করতে চান?',buttons);
}
function flattenCategories(collections){
 const out=[];
 for(const c of collections||[]) for(const k of c.categories||[]) out.push({id:k.id,name:k.name,collectionName:c.name});
 return out;
}

/* ---------- Home / Welcome ---------- */
async function sendWelcome(psid,name=''){
 const cats=flattenCategories(await catalog.categories());
 const first=safe(name,40).split(' ')[0];
 const greeting=`আসসালামু আলাইকুম${first?` ${first}`:''}! 🌸\nনিশাত ফ্যাশনে আপনাকে স্বাগতম।\n\nআমাদের কালেকশনে রয়েছে বিভিন্ন ধরনের ফ্যাশনেবল পোশাক। আপনি কী ধরনের পণ্য খুঁজছেন?`;
 const choices=[
  ...cats.slice(0,6).map(c=>({title:String(c.name).slice(0,20),payload:`CAT|${c.id}`})),
  {title:'🆕 নতুন পণ্য',payload:'MENU|NEW'},
  {title:'📦 আমার অর্ডার',payload:'MENU|ORDERS'},
  {title:'🛒 Cart',payload:'CART|SHOW'}
 ];
 return sendOptions(psid,greeting,choices);
}
function isGreeting(text){
 const t=String(text||'').toLowerCase().trim();
 return HOME_RE.test(t)||/^(hi|hello|hey|হাই|হ্যালো|আসসালামু ?আলাইকুম|সালাম|কি কি আছে|কী কী আছে|কি আছে|কী আছে|show products|what do you have|products)$/i.test(t);
}

/* ---------- Product cards ---------- */
async function sendProductCards(psid,products,footer){
 const publicSite=/^https:\/\//i.test(SITE_URL)?SITE_URL.replace(/\/$/,''):null;
 const elements=products.slice(0,10).map(p=>{
  const price=Number(p.sellingPrice??p.price??p.minPrice??0);
  const regular=Number(p.regularPrice||0);
  const inStock=Number(p.totalStock||0)>0;
  const priceText=regular>price&&price>0?`${taka(price)} (আগে ${taka(regular)})`:taka(price);
  const stockText=inStock?(p.stockStatus==='low_stock'?'⚠️ Low stock':'✅ In stock'):'❌ Out of stock';
  const web=publicSite&&p.slug?[{type:'web_url',title:'🌐 Website',url:`${publicSite}/products/${encodeURIComponent(p.slug)}`}]:[];
  return {
   title:p.name,
   subtitle:`${priceText} · ${stockText} · Code: ${p.shortCode||p.sku||'—'}`,
   ...(p.mainImage?{image_url:p.mainImage}:{}),
   buttons:inStock
    ?[{type:'postback',title:'🛍️ অর্ডার করুন',payload:`BUY|${p.id}`},...web]
    :[{type:'postback',title:'🔔 Restock জানান',payload:`RESTOCK|${p.id}`},{type:'postback',title:'🔁 Similar',payload:`RELATED|${p.id}`}]
  };
 });
 await msgr.generic(psid,elements);
 const f=footer||{text:'আর কী দেখতে চান?',items:NAV};
 await msgr.quickReplies(psid,f.text,f.items);
}
async function sendSearchPage(psid,conv,offset=0){
 const ids=Array.isArray(conv.searchResultIds)?conv.searchResultIds:[];
 const pageIds=ids.slice(offset,offset+10);
 const products=(await Promise.all(pageIds.map(id=>catalog.getById(id)))).filter(Boolean).filter(p=>p.status==='active');
 if(!products.length)return msgr.quickReplies(psid,'আর কোনো Matching Product পাওয়া যায়নি।',NAV);
 const next=offset+10;
 const footer=next<ids.length
  ?{text:`আরও ${ids.length-next}টি Matching Product রয়েছে।`,items:[{title:'➕ আরও পণ্য',payload:`SEARCH|MORE|${next}`},...NAV]}
  :undefined;
 return sendProductCards(psid,products,footer);
}

/* ---------- New arrivals ---------- */
async function getNewArrivals(limit=10){
 if(typeof catalog.newArrivals==='function')return catalog.newArrivals(limit);
 const cats=await catalog.categories();const seen=new Map();
 for(const c of cats)for(const k of (c.categories||[])){
  for(const p of (await catalog.byCategory(k.id))||[]){
   if(p&&(!p.status||p.status==='active')&&!seen.has(p.id))seen.set(p.id,p);
  }
 }
 return [...seen.values()]
  .filter(p=>Number(p.totalStock??1)>0)
  .sort((a,b)=>ms(b.createdAt||b.updatedAt)-ms(a.createdAt||a.updatedAt))
  .slice(0,limit);
}
async function sendNewArrivals(psid){
 const items=await getNewArrivals(10);
 if(!items.length)return msgr.quickReplies(psid,'এই মুহূর্তে নতুন পণ্য দেখানো যাচ্ছে না। Category থেকে পণ্য দেখতে পারেন।',[{title:'🛍️ সব Category',payload:'MENU|SHOP'},{title:'🏠 Home',payload:'MENU|HOME'}]);
 await msgr.text(psid,'🆕 আমাদের একদম নতুন কালেকশন:');
 return sendProductCards(psid,items);
}

/* ---------- My orders ---------- */
const STATUS={pending:'⏳ Pending — যাচাই চলছে',confirmed:'✅ Confirmed',processing:'🧵 Processing',packed:'📦 Packed',shipped:'🚚 Shipped',out_for_delivery:'🛵 Delivery-র পথে',delivered:'🎉 Delivered',completed:'🎉 Completed',cancelled:'❌ Cancelled',canceled:'❌ Cancelled',returned:'↩️ Returned'};
const statusLabel=s=>STATUS[String(s||'pending').toLowerCase().replace(/[\s-]+/g,'_')]||String(s||'Pending');
async function getCustomerOrders(psid,conv){
 const map=new Map();
 try{
  const snap=await db.collection('orders').where('conversationId','==',psid).limit(20).get();
  snap.docs.forEach(d=>map.set(d.id,{id:d.id,...d.data()}));
 }catch(e){console.error('[my-orders-query-failed]',e.message);}
 if(!map.size&&conv.lastOrderId){
  try{const d=await db.doc(`orders/${conv.lastOrderId}`).get();if(d.exists&&d.data().conversationId===psid)map.set(d.id,{id:d.id,...d.data()});}catch(e){console.error('[my-orders-fallback-failed]',e.message);}
 }
 return [...map.values()].sort((a,b)=>ms(b.createdAt)-ms(a.createdAt)).slice(0,10);
}
async function showMyOrders(psid,conv){
 const orders=await getCustomerOrders(psid,conv);
 if(!orders.length)return msgr.quickReplies(psid,'এই Messenger থেকে করা কোনো অর্ডার খুঁজে পাইনি। 🛍️\nচাইলে এখনই নতুন পণ্য দেখতে পারেন।',[{title:'🆕 নতুন পণ্য',payload:'MENU|NEW'},{title:'🏠 Home',payload:'MENU|HOME'}]);
 await msgr.generic(psid,orders.map(o=>({
  title:`অর্ডার ${o.orderNo||String(o.id).slice(0,8)}`,
  subtitle:[statusLabel(o.status),taka(o.total),fmtDate(ms(o.createdAt))].filter(Boolean).join(' · '),
  buttons:[{type:'postback',title:'📋 বিস্তারিত দেখুন',payload:`ORDER|VIEW|${o.id}`}]
 })));
 return msgr.quickReplies(psid,'আপনার সাম্প্রতিক অর্ডার। বিস্তারিত দেখতে কার্ডের বাটন চাপুন।',[{title:'🆕 নতুন পণ্য',payload:'MENU|NEW'},{title:'🏠 Home',payload:'MENU|HOME'}]);
}
async function viewOrder(psid,orderId){
 const snap=await db.doc(`orders/${String(orderId||'').replace(/\//g,'')}`).get();
 const o=snap.exists?{id:snap.id,...snap.data()}:null;
 if(!o||o.conversationId!==psid)return msgr.quickReplies(psid,'অর্ডারটি খুঁজে পাওয়া যায়নি।',[{title:'📦 আমার অর্ডার',payload:'MENU|ORDERS'},{title:'🏠 Home',payload:'MENU|HOME'}]);
 const items=(o.items||o.lineItems||[]).map((x,i)=>`${i+1}. ${x.name||x.productName||'Product'} (${x.color||'—'}/${x.size||'—'}) × ${x.qty||x.quantity||1}`).join('\n');
 const track=o.trackingId||o.trackingNumber;
 const text=[
  `📦 অর্ডার ${o.orderNo||o.id}`,
  `স্ট্যাটাস: ${statusLabel(o.status)}`,
  fmtDate(ms(o.createdAt))?`তারিখ: ${fmtDate(ms(o.createdAt))}`:'',
  items?`\n${items}`:'',
  `\nSubtotal: ${taka(o.subtotal)}`,
  `Delivery: ${taka(o.deliveryCharge)}`,
  Number(o.discount||0)>0?`Discount: -${taka(o.discount)}`:'',
  `মোট: ${taka(o.total)}`,
  'Payment: Cash on Delivery',
  o.courier?`Courier: ${o.courier}`:'',
  track?`Tracking: ${track}`:'',
  String(o.status||'pending').toLowerCase()==='pending'?'\nআমাদের প্রতিনিধি যাচাই শেষে আপনার অর্ডার Confirm করবেন।':''
 ].filter(Boolean).join('\n');
 return sendWithButtons(psid,text,[{title:'📦 সব অর্ডার',payload:'MENU|ORDERS'},{title:'🛍️ আরও কিনুন',payload:'MENU|SHOP'},{title:'🏠 Home',payload:'MENU|HOME'}]);
}

/* ---------- Product options ---------- */
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
  {title:'🔔 Restock জানান',payload:`RESTOCK|${p.id}`},{title:'🔁 Similar products',payload:`RELATED|${p.id}`},{title:'🏠 Home',payload:'MENU|HOME'}
 ]);
}
async function showColors(psid,p){
 const variants=Object.entries(p.variants||{}).filter(([sku,v])=>v.isActive!==false&&Number(v.stock)>0);
 const colors=[...new Set(variants.map(([sku,v])=>String(v.color||'').trim()).filter(Boolean))];
 if(!colors.length)return showOutOfStock(psid,p);
 return sendOptions(psid,`${p.name}\nAvailable Color নির্বাচন করুন 👇`,colors.slice(0,10).map(color=>({title:`${colorIcon(color)} ${color}`.slice(0,20),payload:makePayload('COLOR',p.id,encodeURIComponent(color))})));
}
async function showSizes(psid,p,color){
 const variants=Object.entries(p.variants||{}).filter(([sku,v])=>v.isActive!==false&&Number(v.stock)>0&&String(v.color||'')===color);
 if(!variants.length)return msgr.text(psid,'এই Color-এর কোনো Size এখন Stock-এ নেই।');
 const sizes=[...new Map(variants.map(([sku,v])=>[String(v.size),{size:String(v.size),sku}])).values()];
 return sendOptions(psid,`${colorIcon(color)} ${color}\nAvailable Size নির্বাচন করুন 👇`,sizes.slice(0,10).map(v=>({title:v.size.slice(0,20),payload:makePayload('SIZE',p.id,encodeURIComponent(color),encodeURIComponent(v.size))})));
}

/* ---------- Cart & checkout ---------- */
async function showCart(psid,conv){
 const cart=conv.cart||[];
 if(!cart.length)return msgr.postbackButtons(psid,'🛒 আপনার Cart খালি। পণ্য খুঁজতে নিচের Button চাপুন।',[{title:'🛍️ Shop products',payload:'MENU|SHOP'},{title:'🆕 নতুন পণ্য',payload:'MENU|NEW'},{title:'📦 আমার অর্ডার',payload:'MENU|ORDERS'}]);
 const lines=cart.map((x,i)=>`${i+1}. ${x.name} · ${x.color}/${x.size} × ${x.qty} = ${taka(x.unitPrice*x.qty)}`).join('\n');
 const total=cart.reduce((n,x)=>n+x.unitPrice*x.qty,0);
 return sendWithButtons(psid,`🛒 আপনার Cart:\n\n${lines}\n\nSubtotal: ${taka(total)}\nDelivery Charge Checkout-এ যোগ হবে।`,[{title:'✅ Checkout',payload:'CHECKOUT'},{title:'➕ Add more',payload:'MENU|SHOP'},{title:'🗑️ Clear cart',payload:'CART|CLEAR'}]);
}
async function checkoutPrompt(psid,conv){
 const step=conv.checkout?.step||'name';
 const q={
  name:'অর্ডার করতে আপনার পূর্ণ নাম লিখুন।',
  phone:'আপনার মোবাইল নম্বর লিখুন। উদাহরণ: 01XXXXXXXXX',
  address:'আপনার সম্পূর্ণ ঠিকানা লিখুন (বাসা/রোড/এলাকা)।',
  district:'আপনার জেলা লিখুন।'
 };
 const back=step==='name'?[]:[{title:'⬅️ Back',payload:'ORDER|BACK'}];
 return msgr.quickReplies(psid,q[step]||q.name,[...back,{title:'❌ Cancel / Exit',payload:'ORDER|CANCEL'}]);
}
async function beginCheckout(psid,conv){
 if(!(conv.cart||[]).length)return msgr.quickReplies(psid,'আগে অন্তত একটি Product Cart-এ যোগ করুন।',[{title:'🛍️ Shop products',payload:'MENU|SHOP'},{title:'🆕 নতুন পণ্য',payload:'MENU|NEW'}]);
 conv.checkout={step:'name',customer:{},startedAt:Date.now()};
 await saveConversation(db.doc(`conversations/${psid}`),conv);
 return checkoutPrompt(psid,conv);
}
function deliveryFor(district){
 const d=String(district||'').trim().toLowerCase();
 return ['dhaka','ঢাকা'].includes(d)?Number(process.env.DELIVERY_DHAKA||80):Number(process.env.DELIVERY_OUTSIDE||130);
}
async function sendConfirm(psid,conv){
 const c=conv.checkout?.customer||{};
 const subtotal=(conv.cart||[]).reduce((n,x)=>n+x.unitPrice*x.qty,0);
 const delivery=deliveryFor(c.district);
 const lines=(conv.cart||[]).map((x,i)=>`${i+1}. ${x.name} (${x.color}/${x.size}) × ${x.qty}`).join('\n');
 const text=`অর্ডারটি Confirm করবেন?\n\n👤 ${c.name}\n📞 ${c.phone}\n📍 ${c.address}, ${c.district}\n\n${lines}\n\nSubtotal: ${taka(subtotal)}\nDelivery: ${taka(delivery)}\nমোট (আনুমানিক): ${taka(subtotal+delivery)}\nPayment: Cash on Delivery`;
 return sendWithButtons(psid,text,[{title:'✅ Confirm order',payload:'ORDER|CONFIRM'},{title:'✏️ Edit details',payload:'ORDER|EDIT'},{title:'❌ Cancel',payload:'ORDER|CANCEL'}]);
}
async function finishOrder(psid,conv){
 const c=conv.checkout?.customer||{};
 if(!c.name||!c.phone||!c.address||!c.district)return msgr.text(psid,'কিছু তথ্য বাকি আছে। আবার Checkout চাপুন।');
 const verification=await verifier.verify(conv.messages||[],{...c,items:conv.cart||[],consent:true});
 let order;
 try{
  order=await createOrder({customer:c,items:conv.cart.map(x=>({productId:x.productId,variantSku:x.variantSku,color:x.color,size:x.size,qty:x.qty})),verification,conversationId:psid,idempotencyKey:`messenger-${psid}-${conv.checkout.startedAt}`});
 }catch(e){
  console.error('[order-create-failed]',psid,e.message);
  conv.checkout.step='confirm';
  await saveConversation(db.doc(`conversations/${psid}`),conv,{needsAttention:true,lastError:e.message});
  return msgr.text(psid,'দুঃখিত, এই মুহূর্তে অর্ডারটি সম্পন্ন করা যায়নি। আমাদের প্রতিনিধিকে জানানো হয়েছে, শীঘ্রই যোগাযোগ করা হবে।');
 }
 const itemLines=(conv.cart||[]).map((x,i)=>`${i+1}. ${x.name} (${x.color||'—'}/${x.size||'—'}) × ${x.qty} = ${taka(Number(x.unitPrice||0)*Number(x.qty||0))}`).join('\n');
 const msg=`🎉 ধন্যবাদ ${c.name}! আপনার অর্ডার ${order.orderNo} গ্রহণ করা হয়েছে।\n\nঅর্ডারের বিবরণ:\n${itemLines}\n\nSubtotal: ${taka(order.subtotal||conv.cart.reduce((n,x)=>n+x.unitPrice*x.qty,0))}\nDelivery Charge: ${taka(order.deliveryCharge||0)}\nDiscount: ${taka(order.discount||0)}\nTotal Payable: ${taka(order.total||0)}\n\nVerification: ${verification.verdict==='ok'?'প্রাথমিকভাবে যাচাইকৃত':'Admin Review প্রয়োজন'}\nOrder Status: Pending\nআমাদের প্রতিনিধি প্রয়োজনীয় যাচাই শেষে আপনার অর্ডার Confirm করবেন।`;
 conv.cart=[];conv.checkout=null;conv.flow=null;
 await saveConversation(db.doc(`conversations/${psid}`),conv,{needsAttention:verification.verdict!=='ok',lastOrderId:order.id,lastOrderNo:order.orderNo});
 await sendAndLog(psid,conv,msg,'order_confirmation');
 return msgr.quickReplies(psid,'অর্ডারের অবস্থা যেকোনো সময় দেখতে পারবেন।',[{title:'📦 আমার অর্ডার',payload:'MENU|ORDERS'},{title:'🆕 নতুন পণ্য',payload:'MENU|NEW'},{title:'🏠 Home',payload:'MENU|HOME'}]);
}
function checkoutIntent(text){
 const t=String(text||'').trim().toLowerCase();
 return /^(?:cancel|stop|exit|না|নাহ|বাতিল|ক্যানসেল|বাদ দিন|আর নিব না|আর নেব না|নিবো না|নেব না|কিনব না|লাগবে না|চাই না)$/i.test(t) ||
  /\b(?:cancel|stop|exit|don't want|dont want|won't take|wont take|not buying|no thanks|nibo na|nebo na|kinbo na|lagbe na)\b/i.test(t) ||
  /(?:নিবো না|নেব না|কিনব না|অর্ডার করব না|অর্ডার করবো না|লাগবে না|চাই না|বাতিল)/i.test(t);
}
function looksLikeCheckoutQuestion(text){
 return /\?|কেন|কিভাবে|কীভাবে|কত|কখন|ডেলিভারি|delivery|price|দাম|stock|স্টক|available|কোথায়/i.test(String(text||''));
}
async function cancelCheckout(psid,conv){
 conv.checkout=null;conv.pendingItem=null;
 await saveConversation(db.doc(`conversations/${psid}`),conv);
 return msgr.postbackButtons(psid,'Checkout বাতিল করা হয়েছে। আপনার Cart-এর পণ্যগুলো রাখা হয়েছে।',[{title:'✅ আবার Checkout',payload:'CHECKOUT'},{title:'🛒 Cart দেখুন',payload:'CART|SHOW'},{title:'🏠 Home',payload:'MENU|HOME'}]);
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
   const result=await chain.reply([{role:'system',content:prompts.system([],categories,conv.profileName||'')},...history,{role:'user',content:raw}]);
   await msgr.quickReplies(psid,`${result.text}\n\nCheckout চালিয়ে যেতে আগের তথ্য দিন, অথবা বাতিল করুন।`,[
    ...(step==='name'?[]:[{title:'⬅️ Back',payload:'ORDER|BACK'}]),
    {title:'❌ Cancel / Exit',payload:'ORDER|CANCEL'}
   ]);
   return;
  }catch(e){return step==='confirm'?sendConfirm(psid,conv):checkoutPrompt(psid,conv);}
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
  await saveConversation(db.doc(`conversations/${psid}`),conv);
  return sendConfirm(psid,conv);
 }else if(step==='confirm'){
  return sendConfirm(psid,conv);
 }else{
  return checkoutPrompt(psid,conv);
 }
 await saveConversation(db.doc(`conversations/${psid}`),conv);
 return checkoutPrompt(psid,conv);
}

/* ---------- Main entry ---------- */
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
 const navIntent=content&&(ORDERS_RE.test(content)||NEW_RE.test(content)||HOME_RE.test(content));
 if(conv.checkout?.step&&content&&!payload&&!navIntent){
  if(checkoutIntent(content))return cancelCheckout(psid,conv);
  return handleCheckoutInput(psid,content,conv);
 }
 if(payload){
  const parts=String(payload).split('|'),action=parts[0];
  if(action==='GET_STARTED'||(action==='MENU'&&parts[1]==='HOME')){
   conv.checkout=null;conv.flow=null;conv.pendingItem=null;await saveConversation(ref,conv,{lastInboundAt:Date.now()});
   return sendWelcome(psid,conv.profileName);
  }
  if(action==='MENU'&&parts[1]==='NEW'){
   conv.checkout=null;conv.flow=null;conv.pendingItem=null;await saveConversation(ref,conv);
   return sendNewArrivals(psid);
  }
  if(action==='MENU'&&parts[1]==='ORDERS'){
   conv.checkout=null;conv.flow=null;conv.pendingItem=null;await saveConversation(ref,conv);
   return showMyOrders(psid,conv);
  }
  if(action==='ORDER'&&parts[1]==='VIEW')return viewOrder(psid,parts[2]);
  if(action==='SEARCH'&&parts[1]==='MORE'){
   return sendSearchPage(psid,conv,Math.max(0,Number(parts[2])||0));
  }
  if(action==='MENU'&&parts[1]==='SHOP'){
   conv.checkout=null;conv.flow=null;await saveConversation(ref,conv,{lastInboundAt:Date.now()});
   const cats=await catalog.categories();const choices=[];
   for(const c of cats)for(const k of (c.categories||[]))choices.push({title:k.name,payload:`CAT|${k.id}`});
   return sendOptions(psid,'কোন Category দেখতে চান? 👇',[...choices.slice(0,8),{title:'🆕 নতুন পণ্য',payload:'MENU|NEW'},{title:'🏠 Home',payload:'MENU|HOME'}]);
  }
  if(action==='RESTOCK'){
   const productId=String(parts[1]||'');
   await db.doc(`restockWatchers/${productId}_${psid}`).set({productId,psid,createdAt:Date.now()},{merge:true});
   return msgr.quickReplies(psid,'ঠিক আছে! পণ্যটি আবার Stock-এ এলে আপনাকে Messenger-এ জানানো হবে। 🔔',NAV);
  }
  if(action==='RELATED'){
   const p=await catalog.getById(parts[1]);
   const categoryId=p?.categoryPaths?.[0]?.categoryId||p?.categories?.[0]?.categoryId;
   const related=categoryId?(await catalog.byCategory(categoryId)).filter(x=>x.id!==p.id).slice(0,5):[];
   if(related.length)return sendProductCards(psid,related);
   return msgr.quickReplies(psid,'এই মুহূর্তে একই Category-তে বিকল্প পণ্য পাওয়া যায়নি। অন্য পণ্য দেখতে পারেন।',[{title:'🆕 নতুন পণ্য',payload:'MENU|NEW'},{title:'🏠 Home',payload:'MENU|HOME'}]);
  }
  if(action==='CAT'){
   const products=await catalog.byCategory(parts[1]);
   if(!products.length)return msgr.quickReplies(psid,'এই Category-তে এখন পণ্য পাওয়া যাচ্ছে না।',[{title:'🛍️ অন্য Category',payload:'MENU|SHOP'},{title:'🏠 Home',payload:'MENU|HOME'}]);
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
   return sendOptions(psid,`${p.name} · ${color}/${size}\nদাম: ${taka(conv.pendingItem.unitPrice)}\nকতটি নিতে চান? 👇`,[1,2,3,4,5].filter(n=>n<=conv.pendingItem.stock).map(n=>({title:String(n),payload:`QTY|${n}`})));
  }
  if(action==='QTY'){
   const qty=Math.max(1,Math.min(5,Number(parts[1])||1));if(!conv.pendingItem)return msgr.text(psid,'আগে Product, Color ও Size নির্বাচন করুন।');
   if(qty>conv.pendingItem.stock)return msgr.text(psid,'এই পরিমাণ Stock-এ নেই।');
   conv.pendingItem.qty=qty;conv.cart.push(conv.pendingItem);conv.pendingItem=null;conv.flow=null;
   await saveConversation(ref,conv);
   await msgr.text(psid,'✅ Cart-এ যোগ করা হয়েছে।');
   return showCart(psid,conv);
  }
  if(action==='CART'&&parts[1]==='CLEAR'){conv.cart=[];await saveConversation(ref,conv);return msgr.quickReplies(psid,'Cart খালি করা হয়েছে।',[{title:'🛍️ Shop products',payload:'MENU|SHOP'},{title:'🆕 নতুন পণ্য',payload:'MENU|NEW'},{title:'🏠 Home',payload:'MENU|HOME'}]);}
  if(action==='CHECKOUT')return beginCheckout(psid,conv);
  if(action==='ORDER'&&parts[1]==='CANCEL')return cancelCheckout(psid,conv);
  if(action==='ORDER'&&parts[1]==='BACK'){
   if(!conv.checkout)return showCart(psid,conv);
   const order=['name','phone','address','district'];const i=order.indexOf(conv.checkout.step||'name');conv.checkout.step=order[Math.max(0,i-1)];await saveConversation(ref,conv);return checkoutPrompt(psid,conv);
  }
  if(action==='ORDER'&&parts[1]==='CONTINUE'){
   const step=conv.checkout?.step||'name';
   if(step==='confirm')return sendConfirm(psid,conv);
   const q={name:'আপনার পূর্ণ নাম লিখুন।',phone:'আপনার মোবাইল নম্বর লিখুন। উদাহরণ: 01XXXXXXXXX',address:'আপনার সম্পূর্ণ ঠিকানা লিখুন।',district:'আপনার জেলা লিখুন।',details:'এক মেসেজে নাম, ফোন, ঠিকানা ও জেলা লিখুন।'};
   return msgr.text(psid,q[step]||'Checkout চালিয়ে যেতে প্রয়োজনীয় তথ্য লিখুন।');
  }
  if(action==='CART'&&parts[1]==='SHOW')return showCart(psid,conv);
  if(action==='ORDER'&&parts[1]==='EDIT'){
   if(!conv.checkout)return showCart(psid,conv);
   conv.checkout.step='name';conv.checkout.customer={};await saveConversation(ref,conv);return checkoutPrompt(psid,conv);
  }
  if(action==='ORDER'&&parts[1]==='CONFIRM'){
   if(conv.checkout?.step!=='confirm')return msgr.text(psid,'Order confirmation session পাওয়া যায়নি। আবার Checkout করুন।');
   return finishOrder(psid,conv);
  }
 }
 if(!content)return;
 if(isGreeting(content))return sendWelcome(psid,conv.profileName);
 if(ORDERS_RE.test(content))return showMyOrders(psid,conv);
 if(NEW_RE.test(content))return sendNewArrivals(psid);
 if(CART_RE.test(content.trim()))return showCart(psid,conv);
 const searchResult=await catalog.search(content,{limit:50});
 const found=searchResult.items;
 if(found.length){
  conv.searchResultIds=found.map(p=>p.id);
  conv.searchQuery=content;
  await saveConversation(ref,conv);
  return sendSearchPage(psid,conv,0);
 }
 if(catalog.isProductSearchIntent(content))return msgr.quickReplies(psid,prompts.notFound,[{title:'🛍️ সব Category',payload:'MENU|SHOP'},{title:'🆕 নতুন পণ্য',payload:'MENU|NEW'},{title:'🏠 Home',payload:'MENU|HOME'}]);
 if(/cart|কার্ট/i.test(content))return showCart(psid,conv);
 if(/order|অর্ডার/i.test(content))return beginCheckout(psid,conv);
 const history=(conv.messages||[]).slice(-HISTORY_LIMIT);
 try{
  const categories=flattenCategories(await catalog.categories());
  await msgr.senderAction(psid,'typing_on');
  const result=await chain.reply([{role:'system',content:prompts.system(found,categories,conv.profileName||'')},...history,{role:'user',content:content}]);
  await sendAndLog(psid,conv,result.text,'ai_reply');
 }catch(e){
  await saveConversation(ref,conv,{needsAttention:true,lastError:e.message});
  return msgr.text(psid,prompts.handoff);
 }
}
module.exports={handle};