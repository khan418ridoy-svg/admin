import { head, esc, inboxText } from '../helpers.js';
import { renderPage } from './index.js';

export async function renderBotChats(root, { api, toast }) {
  const [d, ib] = await Promise.all([api('/api/bot/conversations'), api('/api/bot/inbox?limit=150')]);
  const profileById = new Map((d.items || []).map(c => [c.id, c.profileName || '']));

  const inboxHtml = items => (items || []).map(m =>
    `<article class="inbox-message ${m.kind === 'ai_reply' ? 'ai-replied' : ''} ${m.flagged ? 'flagged' : ''}" data-inbox="${esc(m.id)}">
      <input type="checkbox" data-inbox-check="${esc(m.id)}">
      <div class="inbox-message-body">
        <div class="inbox-meta">
          <strong>${esc(m.senderName || profileById.get(m.psid) || m.psid)}</strong>
          <small class="muted">${esc(m.psid)}</small>
          <span>${new Date(m.createdAt || Date.now()).toLocaleString()}</span>
          <span class="badge ${m.kind === 'ai_reply' ? 'green' : 'secondary'}">${esc(m.kind || 'incoming')}</span>
          ${m.flagged ? '<span class="badge amber">Flagged</span>' : ''}
        </div>
        <p>${esc(inboxText(m.text))}</p>
        <small class="muted">${esc(m.flagReason || '')}</small>
      </div>
      <div class="inbox-actions">
        <button class="btn outline small" data-flag="${esc(m.id)}" data-flagged="${m.flagged ? '1' : '0'}">${m.flagged ? 'Unflag' : 'Flag'}</button>
        <button class="btn danger small" data-delete="${esc(m.id)}">Mark read & delete</button>
      </div>
    </article>`
  ).join('') || '<div class="empty">No inbox messages</div>';

  root.innerHTML = head('Messenger Inbox', 'Incoming messages · Gemini replies · Flag · Mark read & delete')
    + `<div class="card inbox-card">
      <div class="toolbar inbox-toolbar">
        <strong>Incoming messages</strong>
        <button class="btn outline small" id="refreshFbNames">Refresh Facebook names</button>
        <label><input type="checkbox" id="selectAllInbox"> Select all</label>
        <button class="btn danger" id="bulkDeleteInbox">Mark read & delete selected</button>
        <select id="inboxFilter"><option value="">All messages</option><option value="flagged">Flagged only</option></select>
      </div>
      <div id="inboxList" class="inbox-list">${inboxHtml(ib.items)}</div>
    </div>
    <h2 class="section-title">Conversations</h2>
    <div class="card chat-layout">
      <div class="chat-list">${(d.items || []).map(c =>
        `<div class="chat-item" data-chat="${esc(c.id)}">
          <strong>${esc(c.profileName || c.id)}</strong>
          <small class="muted">${esc(c.id)}</small>
          <p class="muted">${c.humanActive ? 'Human active' : c.needsAttention ? 'Needs attention' : 'Bot active'}</p>
        </div>`
      ).join('') || '<div class="empty">No Messenger conversations yet</div>'}</div>
      <div class="chat-window"><div class="empty">Select a conversation to inspect its transcript.</div></div>
    </div>`;

  root.querySelector('#refreshFbNames').onclick = async () => {
    const b = root.querySelector('#refreshFbNames');
    b.disabled = true;
    try {
      const r = await api('/api/bot/conversations/refresh-profiles', { method: 'POST', body: '{}' });
      toast(`Facebook names updated: ${r.updated || 0}; unavailable: ${r.unavailable || 0}`);
      renderPage('bot-chats', root, { api, toast });
    } catch (e) {
      toast(`Name refresh failed: ${e.message}`);
    } finally {
      b.disabled = false;
    }
  };

  const loadInbox = async filter => {
    const r = await api(`/api/bot/inbox?limit=150${filter === 'flagged' ? '&flagged=true' : ''}`);
    root.querySelector('#inboxList').innerHTML = inboxHtml(r.items);
  };
  root.querySelector('#inboxFilter').onchange = e => loadInbox(e.target.value);
  root.querySelector('#selectAllInbox').onchange = e =>
    root.querySelectorAll('[data-inbox-check]').forEach(x => x.checked = e.target.checked);

  root.querySelector('#inboxList').addEventListener('click', async e => {
    const f = e.target.closest('[data-flag]'), del = e.target.closest('[data-delete]');
    try {
      if (f) {
        await api(`/api/bot/inbox/${f.dataset.flag}/flag`, {
          method: 'POST', body: JSON.stringify({ flagged: f.dataset.flagged !== '1' })
        });
        await loadInbox(root.querySelector('#inboxFilter').value);
        toast('Flag updated');
      }
      if (del) {
        await api(`/api/bot/inbox/${del.dataset.delete}/read-delete`, { method: 'POST', body: '{}' });
        del.closest('[data-inbox]').remove();
        toast('Message deleted');
      }
    } catch (err) { toast(err.message); }
  });

  root.querySelector('#bulkDeleteInbox').onclick = async () => {
    const ids = [...root.querySelectorAll('[data-inbox-check]:checked')].map(x => x.dataset.inboxCheck);
    if (!ids.length) return toast('Select messages first');
    if (!confirm(`${ids.length}টি Message delete করবেন?`)) return;
    try {
      await api('/api/bot/inbox/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
      await loadInbox(root.querySelector('#inboxFilter').value);
      toast(`${ids.length} messages deleted`);
    } catch (e) { toast(e.message); }
  };

  root.querySelectorAll('[data-chat]').forEach(el => el.onclick = () => {
    const c = d.items.find(x => x.id === el.dataset.chat);
    root.querySelectorAll('.chat-item').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    const win = root.querySelector('.chat-window');
    win.innerHTML = `<h3>${esc(c.profileName || c.id)}</h3>
      <p class="muted">${esc(c.id)}</p>
      <p class="muted">${c.humanActive ? 'Human takeover enabled' : c.needsAttention ? 'Needs attention' : 'Bot is active'}</p>
      ${(c.messages || []).map(m => `<div class="bubble ${m.role === 'assistant' ? 'admin' : ''}">${esc(m.content)}</div>`).join('')}
      <div class="toolbar">
        <button class="btn" id="take">Take over</button>
        <button class="btn secondary" id="resume">Resume bot</button>
        <button class="btn danger" id="block">Block</button>
        <button class="btn outline" id="unblock">Unblock</button>
      </div>
      <div class="field">
        <textarea id="adminReply" placeholder="Write a reply..."></textarea>
        <button class="btn" id="sendAdminReply">Send reply</button>
      </div>`;
    win.querySelector('#take').onclick = async () => { await api(`/api/bot/conversations/${c.id}/takeover`, { method: 'POST', body: '{}' }); toast('Human takeover enabled'); };
    win.querySelector('#resume').onclick = async () => { await api(`/api/bot/conversations/${c.id}/resume`, { method: 'POST', body: '{}' }); toast('Bot resumed'); };
    win.querySelector('#block').onclick = async () => { await api(`/api/bot/conversations/${c.id}/block`, { method: 'POST', body: '{}' }); toast('Conversation blocked'); };
    win.querySelector('#unblock').onclick = async () => { await api(`/api/bot/conversations/${c.id}/unblock`, { method: 'POST', body: '{}' }); toast('Conversation unblocked'); };
    win.querySelector('#sendAdminReply').onclick = async () => {
      try {
        await api(`/api/bot/conversations/${c.id}/reply`, {
          method: 'POST', body: JSON.stringify({ text: win.querySelector('#adminReply').value })
        });
        toast('Reply sent');
      } catch (e) { toast(e.message); }
    };
  });
}