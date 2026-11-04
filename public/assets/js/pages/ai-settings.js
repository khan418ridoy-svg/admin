import { head, esc } from '../helpers.js';

export async function renderAiSettings(root, { api, toast }) {
  const d = await api('/api/ai/status');
  root.innerHTML = head('AI Settings', 'Gemini 5 API keys · Cloudflare 10 authorized account slots') + `
    <div class="grid two-col">
      <article class="card">
        <h3 class="section-title">Google Gemini · Chat fallback</h3>
        <div class="metric"><strong>${d.gemini.configuredKeyCount}/${d.gemini.maximumKeys}</strong><span class="muted">API keys configured</span></div>
        <p class="muted">Models tried in order (up to 6)</p>
        <div class="stack">${d.gemini.models.map(m =>
          `<div class="toolbar"><span>${esc(m.name)}</span><span class="badge ${m.unavailableThisProcess ? 'amber' : 'green'}">${m.unavailableThisProcess ? 'Unavailable' : 'Configured model'}</span></div>`
        ).join('')}</div>
        <button class="btn" id="testGemini">Test Gemini</button>
      </article>
      <article class="card">
        <h3 class="section-title">Cloudflare Workers AI</h3>
        <div class="metric"><strong>${d.cloudflare.configuredAccountCount}/${d.cloudflare.maximumAccounts}</strong><span class="muted">Authorized account slots configured</span></div>
        <p><strong>Chat:</strong> ${esc(d.cloudflare.chatModel)}</p>
        <p><strong>Order verification:</strong> ${esc(d.cloudflare.verificationModel)}</p>
        <p class="notice">A failed/rate-limited slot is cooled down and the next configured slot is tried. Configure only accounts you are authorized to use.</p>
        <div class="toolbar">
          <button class="btn" id="testCfChat">Test Cloudflare Chat</button>
          <button class="btn secondary" id="testCfVerify">Test GPT-OSS</button>
        </div>
      </article>
    </div>
    <article class="card">
      <h3 class="section-title">Configuration & security</h3>
      <p>API keys, Account IDs and tokens are read from Render Environment Variables. This page never displays secret values.</p>
      <p class="muted">Gemini: GEMINI_API_KEYS (maximum 5, comma-separated) and GEMINI_MODELS (maximum 6).</p>
      <p class="muted">Cloudflare: CF_ACCOUNT_ID_1 / CF_API_KEY_1 through CF_ACCOUNT_ID_10 / CF_API_KEY_10.</p>
      <p class="muted">Status counts show configured pairs only; use Test buttons to verify.</p>
    </article>`;

  const test = async provider => {
    try {
      const r = await api('/api/ai/test', { method: 'POST', body: JSON.stringify({ provider }) });
      toast(`Success: ${r.provider} · ${r.model} · slot ${r.keySlot || r.accountSlot || '—'}`);
    } catch (e) {
      toast(`AI test failed: ${e.message}`);
    }
  };
  root.querySelector('#testGemini').onclick = () => test('gemini');
  root.querySelector('#testCfChat').onclick = () => test('cloudflare-chat');
  root.querySelector('#testCfVerify').onclick = () => test('cloudflare-verify');
}