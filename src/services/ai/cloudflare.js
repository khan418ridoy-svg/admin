const { CHAT_MODEL, VERIFY_MODEL } = require('../../config/settings');

const accountCooldown = new Map();
let nextAccountIndex = 0;

function accounts() {
  const result = [];
  for (let slot = 1; slot <= 10; slot++) {
    const accountId = String(process.env[`CF_ACCOUNT_ID_${slot}`] || '').trim();
    const token = String(process.env[`CF_API_KEY_${slot}`] || '').trim();
    if (accountId && token) result.push({ slot, accountId, token });
  }
  if (!result.length && process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) {
    result.push({ slot: 1, accountId: process.env.CF_ACCOUNT_ID.trim(), token: process.env.CF_API_TOKEN.trim() });
  }
  return result;
}

function retryable(status) { return status === 408 || status === 425 || status === 429 || status >= 500; }

async function run(model, messages) {
  const configured = accounts();
  if (!configured.length) throw new Error('cloudflare_not_configured: configure an authorized account slot');
  let lastError;
  const start = nextAccountIndex % configured.length;
  const ordered = configured.slice(start).concat(configured.slice(0, start));
  for (const account of ordered) {
    const cooldownKey = `${account.slot}:${account.accountId}`;
    if ((accountCooldown.get(cooldownKey) || 0) > Date.now()) continue;
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account.accountId)}/ai/run/${model.split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: AbortSignal.timeout(20000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        const error = new Error(`Cloudflare slot ${account.slot} HTTP ${response.status}: ${(data.errors || []).map(x => x.message).join('; ') || 'request failed'}`);
        error.status = response.status;
        throw error;
      }
      nextAccountIndex = (configured.findIndex(x => x.slot === account.slot) + 1) % configured.length;
      const result = data.result?.response || data.result?.output_text || data.result?.text || JSON.stringify(data.result || {});
      return { text: result, accountSlot: account.slot, model };
    } catch (error) {
      lastError = error;
      if (error.status === 401 || error.status === 403) { accountCooldown.set(cooldownKey, Date.now() + 10 * 60_000); continue; }
      if (error.status === 429) { accountCooldown.set(cooldownKey, Date.now() + 60_000); continue; }
      if (retryable(error.status) || error.name === 'TimeoutError' || error.name === 'AbortError') continue;
      if (error.status === 400 || error.status === 404) break;
      continue;
    }
  }
  throw new Error(`all_cloudflare_accounts_failed: ${lastError?.message || 'no available authorized account'}`);
}

exports.chat = messages => run(CHAT_MODEL, messages);
exports.verify = messages => run(VERIFY_MODEL, messages);
exports.status = () => ({ configuredAccountCount: accounts().length, maximumAccounts: 10, chatModel: CHAT_MODEL, verificationModel: VERIFY_MODEL });