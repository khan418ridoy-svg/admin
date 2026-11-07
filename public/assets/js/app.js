import { api, setToken } from './api.js';
import { renderLogin } from './login.js';
import { renderPage } from './pages/index.js';

const nav = [
  ['dashboard', '▦', 'Dashboard'],
  ['products', '▣', 'Products'],
  ['lots', '📦', 'Lots'],
  ['categories', '◫', 'Categories'],
  ['orders', '▤', 'Orders'],
  ['bot-chats', '◉', 'Bot Chats'],
  ['low-stock', '▥', 'Low Stock'],
  ['coupons', '％', 'Coupons'],
  ['settings', '⚙', 'Settings'],
  ['facebook-settings', 'f', 'Facebook Settings'],
  ['ai-settings', '✦', 'AI Settings']
];

const app = document.getElementById('app');
let current = 'dashboard', user = null, notificationCursor = Date.now(), notificationTimer = null, audioContext = null;

function layout() {
  app.innerHTML = `<div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-mark">NF</div><div><strong>Nishat Fashion</strong><small>Admin workspace</small></div></div>
      <div><div class="nav-label">WORKSPACE</div><nav class="nav">${nav.map(([id, ico, label]) =>
        `<a href="#${id}" data-page="${id}" class="${current === id ? 'active' : ''}"><span class="ico">${ico}</span>${label}</a>`
      ).join('')}</nav></div>
      <div class="sidebar-bottom">Nishat Fashion Admin<br>Render · Node.js Backend</div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="top-actions">
          <button class="btn secondary mobile-menu" id="menuBtn">☰</button>
          <span class="crumb">Admin / ${nav.find(x => x[0] === current)?.[2] || 'Dashboard'}</span>
        </div>
        <div class="top-actions">
          <span class="muted hide-mobile">${user?.email || ''}</span>
          <button class="btn secondary" id="notifyBtn" title="Browser notification ও sound চালু করুন">🔔 Enable</button>
          <div class="avatar">NF</div>
          <button class="btn outline" id="logoutBtn">Sign out</button>
        </div>
      </header>
      <section class="content" id="pageContent"><div class="empty">Loading…</div></section>
    </main>
  </div>`;

  document.querySelectorAll('[data-page]').forEach(a =>
    a.addEventListener('click', e => { e.preventDefault(); go(a.dataset.page); })
  );
  document.getElementById('logoutBtn').onclick = () => { stopNotifications(); localStorage.removeItem('nf-token'); location.reload(); };
  // ১. মেনু বাটনে ক্লিক করলে সাইডবার টগল হবে
  document.getElementById('menuBtn').onclick = (e) => {
    e.stopPropagation(); // ক্লিক ইভেন্ট যেন ডকুমেন্টে না ছড়ায়
    document.getElementById('sidebar').classList.toggle('open');
  };

  // ২. মোবাইলে সাইডবারের বাইরে ক্লিক করলে সাইডবার বন্ধ হবে
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menuBtn');
    if (sidebar && sidebar.classList.contains('open')) {
      // যদি ক্লিক সাইডবারের ভেতরে বা মেনু বাটনে না লাগে
      if (!sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    }
  });

  // ৩. সাইডবারের যেকোনো লিংকে ক্লিক করলে সাইডবার বন্ধ হবে (মোবাইলে)
  document.querySelectorAll('[data-page]').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth <= 700) {
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  });
  document.getElementById('notifyBtn').onclick = toggleNotifications;
  updateNotificationButton();
  renderPage(current, document.getElementById('pageContent'), { api, toast });
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

function go(page) { current = page; location.hash = page; layout(); }

function updateNotificationButton() {
  const btn = document.getElementById('notifyBtn');
  if (!btn) return;
  const enabled = localStorage.getItem('nf-notifications-enabled') === '1'
    && ('Notification' in window) && Notification.permission === 'granted';
  btn.textContent = enabled ? '🔔 ON' : '🔕 OFF';
  btn.title = enabled ? 'Click to turn notifications off' : 'Click to turn notifications on';
}

async function toggleNotifications() {
  if (localStorage.getItem('nf-notifications-enabled') === '1') {
    localStorage.setItem('nf-notifications-enabled', '0');
    stopNotifications();
    updateNotificationButton();
    toast('Browser notification ও sound বন্ধ হয়েছে।');
    return;
  }
  await enableNotifications();
}

async function enableNotifications() {
  if (!('Notification' in window)) return toast('এই Browser Notification API support করে না।');
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return toast('Browser notification permission দেওয়া হয়নি।');
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioContext = audioContext || new AudioCtx();
      if (audioContext.state === 'suspended') await audioContext.resume();
      playChime();
    }
    localStorage.setItem('nf-notifications-enabled', '1');
    updateNotificationButton();
    startNotifications();
    toast('Browser notification ও sound চালু হয়েছে।');
  } catch (e) { toast('Notification চালু করা যায়নি: ' + e.message); }
}

function playChime() {
  if (!audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  [880, 1174].forEach((hz, i) => {
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, now + i * .13);
    gain.gain.exponentialRampToValueAtTime(.12, now + i * .13 + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, now + i * .13 + .22);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now + i * .13);
    osc.stop(now + i * .13 + .24);
  });
}

function showBrowserNotification(item) {
  if (Notification.permission !== 'granted') return;
  const n = new Notification(item.title, { body: item.body, tag: `nf-${item.type}-${item.id}`, renotify: false });
  n.onclick = () => { window.focus(); go(item.type === 'order' ? 'orders' : 'bot-chats'); n.close(); };
  playChime();
}

async function pollNotifications() {
  try {
    const d = await api(`/api/bot/notifications?since=${notificationCursor}`);
    for (const item of d.items || []) { showBrowserNotification(item); toast(`${item.title}: ${item.body}`); }
    notificationCursor = Math.max(notificationCursor, Number(d.cursor) || notificationCursor, Date.now() - 1000);
  } catch (e) { /* retried next poll */ }
}

function startNotifications() {
  stopNotifications();
  notificationCursor = Date.now();
  updateNotificationButton();
  if ('Notification' in window && localStorage.getItem('nf-notifications-enabled') === '1'
    && Notification.permission === 'granted') {
    pollNotifications();
    notificationTimer = setInterval(pollNotifications, 15000);
  }
}

function stopNotifications() { if (notificationTimer) clearInterval(notificationTimer); notificationTimer = null; }

async function start() {
  const token = localStorage.getItem('nf-token');
  if (!token) {
    renderLogin(app, { onLogin: async t => { localStorage.setItem('nf-token', t); setToken(t); await start(); } });
    return;
  }
  setToken(token);
  try {
    const me = await api('/api/auth/me');
    user = me;
    current = location.hash.slice(1) || 'dashboard';
    if (!nav.some(x => x[0] === current)) current = 'dashboard';
    layout();
    startNotifications();
  } catch {
    stopNotifications();
    localStorage.removeItem('nf-token');
    renderLogin(app, { onLogin: async t => { localStorage.setItem('nf-token', t); setToken(t); await start(); } });
  }
}

window.addEventListener('hashchange', () => {
  const p = location.hash.slice(1);
  if (nav.some(x => x[0] === p)) go(p);
});

start();