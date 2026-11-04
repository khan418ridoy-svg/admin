import { head, esc } from '../helpers.js';
import { renderPage } from './index.js';

export async function renderFacebookSettings(root, { api, toast }) {
  const d = await api('/api/facebook/status');
  const expiry = d.userTokenExpiresAt ? new Date(d.userTokenExpiresAt).toLocaleString() : 'Meta did not return an expiry';
  root.innerHTML = head('Facebook Settings', 'Connect your Facebook account and choose the Page used by Messenger') + `
    <div class="grid two-col">
      <article class="card">
        <h3 class="section-title">Facebook account</h3>
        <p><span class="badge ${d.connected ? 'green' : 'amber'}">${d.connected ? 'Connected' : 'Not connected'}</span></p>
        <p class="muted">User token expiry: ${esc(expiry)}</p>
        <button class="btn" id="connectFb">${d.connected ? 'Reconnect Facebook' : 'Connect Facebook'}</button>
        ${d.connected ? '<button class="btn danger" id="disconnectFb">Disconnect</button>' : ''}
        <p class="notice">The App Secret and access tokens stay on the server. Never place them in browser code or GitHub.</p>
      </article>
      <article class="card">
        <h3 class="section-title">Select Facebook Page</h3>
        <p class="muted">Pages available to the connected account</p>
        <select id="fbPage">
          <option value="">Choose a Page</option>
          ${(d.pages || []).map(p => `<option value="${esc(p.id)}" ${p.id === d.selectedPageId ? 'selected' : ''}>${esc(p.name)} (${esc(p.id)})</option>`).join('')}
        </select>
        <p class="muted">Selected Page: ${esc((d.pages || []).find(p => p.id === d.selectedPageId)?.name || 'None')}</p>
        <button class="btn" id="saveFbPage" ${!d.connected ? 'disabled' : ''}>Save selected Page</button>
      </article>
    </div>`;

  root.querySelector('#connectFb').onclick = async () => {
    try {
      const r = await api('/api/facebook/start');
      location.href = r.url;
    } catch (e) { toast(e.message); }
  };
  root.querySelector('#saveFbPage').onclick = async () => {
    const pageId = root.querySelector('#fbPage').value;
    if (!pageId) return toast('Select a Facebook Page');
    try {
      await api('/api/facebook/select-page', { method: 'POST', body: JSON.stringify({ pageId }) });
      toast('Facebook Page selected');
      renderPage('facebook-settings', root, { api, toast });
    } catch (e) { toast(e.message); }
  };
  root.querySelector('#disconnectFb')?.addEventListener('click', async () => {
    if (!confirm('Disconnect Facebook and remove the saved Page token?')) return;
    await api('/api/facebook/disconnect', { method: 'POST', body: '{}' });
    toast('Facebook disconnected');
    renderPage('facebook-settings', root, { api, toast });
  });
}