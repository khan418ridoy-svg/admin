const gemini = require('./gemini');
exports.reply = async messages => {
  const result = await gemini.generate(messages);
  return { text: result.text, by: `gemini:${result.model}`, model: result.model, keySlot: result.keySlot };
};