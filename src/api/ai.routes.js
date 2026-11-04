const router=require('express').Router();
const adminAuth=require('../middleware/adminAuth');
const asyncHandler=require('../utils/asyncHandler');
const gemini=require('../services/ai/gemini');
router.use(adminAuth);
router.get('/status',asyncHandler(async(req,res)=>res.json({ok:true,provider:'Google Gemini',gemini:gemini.status(),note:'Customer chat and order verification both use Gemini. Secret values are never exposed.'})));
router.post('/test',asyncHandler(async(req,res)=>{const provider=req.body.provider;const prompt=[{role:'user',content:'Reply with exactly: CONNECTION_OK'}];if(provider==='gemini'){const r=await gemini.generate(prompt);return res.json({ok:true,provider,model:r.model,keySlot:r.keySlot,response:r.text});}return res.status(400).json({ok:false,error:'unknown_ai_provider'});}));
router.post('/product-content',asyncHandler(async(req,res)=>{const {product={},fields,language='English'}=req.body||{};if(!String(product.name||'').trim())return res.status(400).json({ok:false,error:'product_name_required'});const r=await gemini.generateProductContent({product,fields,language});res.json({ok:true,fields:r.fields,model:r.model,keySlot:r.keySlot});}));
module.exports=router;