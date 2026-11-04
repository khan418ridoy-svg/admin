const {db}=require('../config/firebase');
const {handle}=require('./handleMessage');
async function processWebhookEvent(body){
 for(const entry of body.entry||[])for(const event of entry.messaging||[]){
  if(!event.sender?.id||event.message?.is_echo)continue;
  if(!event.message && !event.postback)continue;
  const pageId=String(entry.id||''),psid=String(event.sender.id),mid=event.message?.mid||event.postback?.mid||`evt_${pageId}_${psid}_${event.timestamp}`;
  if(pageId&&psid===pageId){console.warn('[messenger-webhook] ignored event where sender is the Page itself',pageId);continue;}
  const text=event.message?.text||event.postback?.title||'';
  console.info(`[messenger-webhook] received page=${pageId||'unknown'} psid=${psid} mid=${mid} type=${event.postback?'postback':event.message?.attachments?'attachment':'message'}`);
  const payload=event.message?.quick_reply?.payload||event.postback?.payload||null;
  const ref=db.collection('botEvents').doc(Buffer.from(`${pageId}:${mid}`).toString('base64url').slice(0,140));
  try{await ref.create({pageId,mid,psid,text,payload,createdAt:Date.now(),processed:false});}catch(e){if(e.code===6||e.code==='already-exists'||String(e.message||'').includes('ALREADY_EXISTS'))continue;console.error('[messenger-webhook] failed to claim event', {pageId,psid,mid,error:e.message});continue;}
  try{
   const convRef=db.doc(`conversations/${psid}`); const convSnap=await convRef.get();
   const senderName=String(convSnap.data()?.profileName||'');
   await handle({psid,text,payload,mid,senderName});
   await ref.update({processed:true,processedAt:Date.now()});
  }
  catch(e){console.error(`[messenger-handler] page=${pageId} psid=${psid} mid=${mid}`,e.message);await ref.update({processed:false,error:e.message,failedAt:Date.now()});}
 }
}
module.exports={processWebhookEvent};