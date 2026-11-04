let idToken='';
export function setToken(token){idToken=token;}
export async function api(path,options={}){
 const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(idToken?{Authorization:`Bearer ${idToken}`} : {}),...(options.headers||{})}});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d.error||`http_${r.status}`);
 return d;
}
