import { head, esc } from '../helpers.js';

export async function renderAiSettings(root, { api, toast }) {
  const d = await api('/api/ai/status');
  
  // Cloudflare না থাকলে যেন ক্র্যাশ না করে
  const cf = d.cloudflare || { configuredAccountCount: 0, maximumAccounts: 10, chatModel: 'N/A', verificationModel: 'N/A' };

  root.innerHTML = head('AI Settings', 'Google Gemini API settings & AI fallback status') + `
    <div class="grid two-col">
      <article class="card">
        <h3 class="section-title">Google Gemini · Chat & Order Verification</h3>
        <div class="metric" style="margin-bottom: 15px;">
          <strong>${d.gemini.configuredKeyCount}/${d.gemini.maximumKeys}</strong>
          <span class="muted">API keys configured</span>
        </div>
        <p class="muted">Models tried in order (up to 6)</p>
        <div class="stack" style="margin-bottom: 20px;">${d.gemini.models.map(m =>
          `<div class="toolbar" style="margin-bottom: 5px;"><span>${esc(m.name)}</span><span class="badge ${m.unavailableThisProcess ? 'amber' : 'green'}">${m.unavailableThisProcess ? 'Unavailable' : 'Configured'}</span></div>`
        ).join('')}</div>
        <button class="btn" id="testGemini">Test Gemini Connection</button>
      </article>

      <article class="card">
        <h3 class="section-title">Cloudflare Workers AI</h3>
        <div class="metric" style="margin-bottom: 15px;">
          <strong>${cf.configuredAccountCount}/${cf.maximumAccounts}</strong>
          <span class="muted">Authorized account slots</span>
        </div>
        <p><strong>Chat Model:</strong> ${esc(cf.chatModel)}</p>
        <p><strong>Verification Model:</strong> ${esc(cf.verificationModel)}</p>
        <p class="notice">Cloudflare Workers AI is used as a fallback if configured.</p>
        <div class="toolbar" style="margin-top: 15px;">
          <button class="btn secondary" id="testCfChat">Test Cloudflare Chat</button>
          <button class="btn secondary" id="testCfVerify">Test GPT-OSS</button>
        </div>
      </article>
    </div>
    
    <article class="card" style="margin-top: 20px;">
      <h3 class="section-title">Configuration & Security</h3>
      <p>API keys, Account IDs and tokens are read from Render Environment Variables. This page never displays secret values.</p>
      <p class="muted"><strong>Gemini:</strong> GEMINI_API_KEYS (comma-separated) and GEMINI_MODELS.</p>
      <p class="muted"><strong>Cloudflare:</strong> CF_ACCOUNT_ID_1 / CF_API_KEY_1 (if using Cloudflare).</p>
    </article>`;

  const test = async provider => {
    try {
      toast(`Testing ${provider}...`);
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
