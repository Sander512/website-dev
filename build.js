// Draait op Vercel tijdens de build: maakt config.js aan op basis van de
// environment variable AUREX_API_BASE (Vercel -> Project -> Settings ->
// Environment Variables). Een statische site kan in de browser zelf geen
// env vars lezen, dus ze worden hier bij het bouwen "ingebakken".
const fs = require('fs');

const base = (process.env.AUREX_API_BASE || '').trim().replace(/\/$/, '');

if (!base) {
  console.error('[BUILD] AUREX_API_BASE ontbreekt. Zet in Vercel een environment variable AUREX_API_BASE met de URL van je Render-bot, bv. https://aurex-development-bot.onrender.com');
  process.exit(1);
}

fs.writeFileSync('config.js', `window.AUREX_API_BASE = ${JSON.stringify(base)};\n`);
console.log(`[BUILD] config.js aangemaakt met API-URL ${base}`);
