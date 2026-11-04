import {firebaseConfig} from './firebase-client.js';
export function renderLogin(root,{onLogin}){
 root.innerHTML=`<main class="login-wrap"><section class="login-card"><div class="brand"><div class="brand-mark">NF</div><div><strong>Nishat Fashion</strong><small>Owner administration</small></div></div><h1>Welcome back</h1><p class="sub">Sign in to manage your store.</p><div class="notice">শুধু Owner account-এ admin claim থাকলে প্রবেশ করা যাবে।</div><form id="loginForm"><div class="field"><label>Email address</label><input id="email" type="email" required autocomplete="username"></div><div class="field"><label>Password</label><input id="password" type="password" required autocomplete="current-password"></div><button class="btn" style="width:100%">Sign in</button><p id="loginError" class="muted"></p></form><small class="muted">Firebase Authentication · Email / Password</small></section></main>`;
 document.getElementById('loginForm').onsubmit=async e=>{
  e.preventDefault();const err=document.getElementById('loginError');err.textContent='Signing in…';
  try{
   const {initializeApp}=await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js');
   const {getAuth,signInWithEmailAndPassword}=await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js');
   const auth=getAuth(initializeApp(firebaseConfig));const cred=await signInWithEmailAndPassword(auth,document.getElementById('email').value,document.getElementById('password').value);
   const token=await cred.user.getIdToken(true);onLogin(token);
  }catch(ex){err.textContent=ex.message||'Login failed';}
 };
}
