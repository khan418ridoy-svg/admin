// Usage: ADMIN_UID=FirebaseAuthUID node scripts/set-admin-claim.js
require('dotenv').config();
const {auth}=require('../src/config/firebase');
(async()=>{
 const uid=process.env.ADMIN_UID;
 if(!uid)throw new Error('ADMIN_UID environment variable is required');
 await auth.setCustomUserClaims(uid,{admin:true});
 console.log(`Admin claim enabled for UID: ${uid}`);
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
