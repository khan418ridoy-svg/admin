const {GRAPH_VERSION}=require('../config/settings');
let tokenCache={token:null,at:0};
async function getToken(){
 if(tokenCache.token&&Date.now()-tokenCache.at<60000)return tokenCache.token;
 const {db}=require('../config/firebase');
 const active=await db.doc('meta/privateFacebook').get();
 const token=active.exists?active.data().pageAccessToken:process.env.META_PAGE_TOKEN;
 if(!token)throw new Error('meta_page_token_missing_connect_facebook_in_admin');
 tokenCache={token,at:Date.now()};
 return token;
}
async function send(psid,message){
 const token=await getToken();
 const url=`https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(token)}`;
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipient:{id:psid},messaging_type:'RESPONSE',message}),signal:AbortSignal.timeout(12000)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){const err=new Error(d.error?.message||`meta_${r.status}`);err.status=r.status;err.metaCode=d.error?.code;err.metaSubcode=d.error?.error_subcode;err.psid=psid;if(err.metaCode===190)tokenCache={token:null,at:0};console.error('[messenger-send-failed]',JSON.stringify({status:r.status,code:err.metaCode,subcode:err.metaSubcode,message:err.message,psid}));throw err;}
 return d;
}
exports.getProfile=async psid=>{
 const token=await getToken();
 const url=`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(psid)}?fields=name&access_token=${encodeURIComponent(token)}`;
 const r=await fetch(url,{signal:AbortSignal.timeout(8000)}); const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d.error?.message||`meta_profile_${r.status}`);
 return String(d.name||[d.first_name,d.last_name].filter(Boolean).join(' ')||'').trim().slice(0,120);
};
exports.text=(id,text)=>send(id,{text:String(text).slice(0,2000)});
exports.quickReplies=(id,text,items)=>send(id,{text:String(text).slice(0,2000),quick_replies:items.slice(0,13).map(x=>({content_type:'text',title:String(x.title).slice(0,20),payload:String(x.payload).slice(0,1000)}))});
exports.postbackButtons=(id,text,items)=>send(id,{attachment:{type:'template',payload:{template_type:'button',text:String(text).slice(0,640),buttons:items.slice(0,3).map(x=>({type:'postback',title:String(x.title).slice(0,20),payload:String(x.payload).slice(0,1000)}))}}});
exports.generic=(id,elements)=>send(id,{attachment:{type:'template',payload:{template_type:'generic',elements:elements.slice(0,10).map(e=>({title:String(e.title||'Product').slice(0,80),subtitle:String(e.subtitle||'').slice(0,80),...(e.image_url?{image_url:e.image_url}:{}),buttons:(e.buttons||[]).slice(0,3).map(b=>b.type==='web_url'?{type:'web_url',url:b.url,title:String(b.title).slice(0,20)}:{type:'postback',title:String(b.title).slice(0,20),payload:String(b.payload).slice(0,1000)})}))}}});
exports.senderAction=(id,action='typing_on')=>send(id,{sender_action:action});