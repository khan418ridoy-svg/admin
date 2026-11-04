const { GEMINI_MODELS } = require('../../config/settings');
const keyCooldown = new Map();
const modelUnavailable = new Set();
function keys(){return (process.env.GEMINI_API_KEYS||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,5);}
function retryable(status){return status===408||status===425||status===429||status>=500;}
async function request(model,key,prompt,json=false,temperature=0.45){
 const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature,...(json?{responseMimeType:'application/json'}:{})}}),signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>({}));if(!response.ok){const e=new Error(`Gemini HTTP ${response.status}: ${data.error?.message||'request failed'}`);e.status=response.status;throw e;}
 const text=data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();if(!text)throw new Error('gemini_empty_response');return text;
}
async function runFallback(prompt,{json=false,temperature=0.45}={}){
 const apiKeys=keys();if(!apiKeys.length)throw new Error('gemini_not_configured');let lastError;
 for(const model of GEMINI_MODELS){if(modelUnavailable.has(model))continue;
  for(let i=0;i<apiKeys.length;i++){const key=apiKeys[i];if((keyCooldown.get(key)||0)>Date.now())continue;
   try{return {text:await request(model,key,prompt,json,temperature),model,keySlot:i+1};}
   catch(e){lastError=e;if(e.status===404){modelUnavailable.add(model);break;}if(e.status===401||e.status===403){keyCooldown.set(key,Date.now()+600000);continue;}if(e.status===429){keyCooldown.set(key,Date.now()+60000);continue;}if(retryable(e.status)||e.name==='TimeoutError'||e.name==='AbortError')continue;break;}
  }
 }
 throw new Error(`all_gemini_fallbacks_failed: ${lastError?.message||'no available key/model'}`);
}
async function generate(messages,options={}){const list=Array.isArray(messages)?messages:[];const system=list.filter(m=>m.role==='system').map(m=>String(m.content||'')).join('\n\n');const turns=list.filter(m=>m.role!=='system').map(m=>`${m.role==='assistant'?'Assistant':'Customer'}: ${String(m.content||'')}`).join('\n');const prompt=[system?`SYSTEM INSTRUCTIONS:\n${system}`:'',`CONVERSATION:\n${turns}`, 'Respond to the latest customer message.'].filter(Boolean).join('\n\n');return runFallback(prompt,options);}
async function generateProductContent({product,fields,language='English'}){
 const allowed=['shortDescription','description','washCare','tags','metaTitle','metaDescription'];const requested=[...new Set((fields||allowed).filter(x=>allowed.includes(x)))];if(!requested.length)throw new Error('no_valid_ai_fields');
 const prompt=`You write accurate ecommerce product content for Nishat Fashion. Return ONLY a valid JSON object, no markdown. Language: ${language}. Use ONLY the supplied product facts. Never invent GSM, fabric composition percentages, certification, origin, features, or claims. If information is missing, write a conservative generic description. Product facts: ${JSON.stringify(product)}. Generate only these keys: ${requested.join(', ')}. Rules: shortDescription <=160 characters; description plain text or minimal safe HTML; washCare one concise sentence; tags array of 3-8 lowercase short strings; metaTitle <=60 characters; metaDescription <=160 characters. JSON values must be strings except tags which is an array of strings.`;
 const result=await runFallback(prompt,{json:true});let parsed;try{parsed=JSON.parse(result.text.replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim());}catch{throw new Error('gemini_invalid_json_response');}
 const out={};for(const k of requested){let v=parsed[k];if(k==='tags'){if(typeof v==='string')v=v.split(',');if(Array.isArray(v))v=[...new Set(v.map(x=>String(x).toLowerCase().trim()).filter(Boolean))].slice(0,8);else continue;}else if(typeof v==='string'){v=v.trim();const max={shortDescription:160,metaTitle:60,metaDescription:160};if(max[k])v=v.slice(0,max[k]);}else continue;if((Array.isArray(v)&&v.length)||(!Array.isArray(v)&&v))out[k]=v;}
 if(!Object.keys(out).length)throw new Error('gemini_no_valid_fields');return {...result,fields:out};
}
function status(){const configuredKeys=keys();return {provider:'Google Gemini',configuredKeyCount:configuredKeys.length,maximumKeys:5,models:GEMINI_MODELS.map(name=>({name,unavailableThisProcess:modelUnavailable.has(name)}))};}
module.exports={generate,generateProductContent,status};