const router=require('express').Router();
const asyncHandler=require('../utils/asyncHandler');
const {submit}=require('../services/orders/orderForm');
const catalog=require('../services/catalog/search');

router.get('/product',asyncHandler(async(req,res)=>{const p=await catalog.getByCode(req.query.code);if(!p||!p.inStock)return res.status(404).json({ok:false});res.json({ok:true,item:p});}));
router.post('/submit',asyncHandler(submit));
module.exports=router;