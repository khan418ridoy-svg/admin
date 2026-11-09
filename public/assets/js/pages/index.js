// Page router - routes to individual page modules
import { renderDashboard } from './dashboard.js';
import { renderProducts } from './products.js';
import { renderCategories } from './categories.js';
import { renderOrders } from './order.js';
import { renderLowStock } from './low-stock.js';
import { renderBotChats } from './bot-chats.js';
import { renderCoupons } from './coupons.js';
import { renderSettings } from './settings.js';
import { renderPos } from './pos.js';
import { renderFacebookSettings } from './facebook-settings.js';
import { renderAiSettings } from './ai-settings.js';
import { head, esc } from '../helpers.js';
import { renderLots } from './lots.js';
// ...


const pages = {
  dashboard: renderDashboard,
  products: renderProducts,
  lots: renderLots,
  categories: renderCategories,
  orders: renderOrders,
  pos: renderPos,
  'low-stock': renderLowStock,
  'bot-chats': renderBotChats,
  coupons: renderCoupons,
  settings: renderSettings,
  'facebook-settings': renderFacebookSettings,
  'ai-settings': renderAiSettings
};

export async function renderPage(page, root, { api, toast }) {
  const renderer = pages[page];
  if (!renderer) {
    root.innerHTML = head('Page not found', `No handler for "${esc(page)}"`);
    return;
  }
  try {
    await renderer(root, { api, toast, renderPage });
  } catch (e) {
    root.innerHTML = head('Unable to load page', 'API বা Firebase connection পরীক্ষা করুন')
      + `<div class="card notice">${esc(e.message)}</div>`;
  }
}
