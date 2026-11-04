const gemini = require('./gemini');
exports.verify = async (conversation, form) => {
  const messages = [
    { role: 'system', content: 'You are a conservative ecommerce order consistency checker. Return ONLY JSON: {"verdict":"ok"|"review"|"suspected_spam","reasons":[]}. Check missing consent, contradictory customer details, impossible quantities and repeated suspicious submissions. Do not invent facts and never modify customer data, price or stock. If uncertain, use review.' },
    { role: 'user', content: JSON.stringify({ conversation: (conversation || []).slice(-20), form }) }
  ];
  try {
    const result = await gemini.generate(messages, { json: true, temperature: 0.1 });
    const raw = result.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    return {
      verdict: ['ok', 'review', 'suspected_spam'].includes(parsed.verdict) ? parsed.verdict : 'review',
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 10).map(String) : [],
      model: result.model,
      keySlot: result.keySlot
    };
  } catch (error) {
    console.warn('[order-verifier] Gemini verification unavailable; manual review required:', error.message);
    return { verdict: 'review', reasons: ['Gemini verification unavailable; manual review required'], model: 'unavailable' };
  }
};