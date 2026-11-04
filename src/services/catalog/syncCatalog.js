const {db}=require('../../config/firebase');
const {buildCatalogItem}=require('./toItem');
async function rebuildCatalog(){
 const snap=await db.collection('products').get();
 const items={}; snap.docs.forEach(d=>{items[d.id]=buildCatalogItem(d.id,d.data());});
 await db.doc('meta/catalog').set({items,updatedAt:Date.now(),count:snap.size});
 await db.runTransaction(async tx=>{
  const ref=db.doc('meta/catalogVersion'),v=await tx.get(ref);
  tx.set(ref,{version:Number(v.data()?.version||0)+1,changes:[],updatedAt:Date.now(),fullRebuild:true},{merge:true});
 });
 await db.doc('meta/versions').set({catalog:Date.now()},{merge:true});
 return snap.size;
}
module.exports={rebuildCatalog};