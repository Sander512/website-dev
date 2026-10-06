# Aurex Shop (losse website)

Statische webshop-pagina die los van de bot draait. Praat met je bot/API
(Render) via `config.js`. Geen build-stap nodig.

## Deployen op Vercel

1. Zet deze map in een eigen GitHub-repo (of upload via `vercel` CLI).
2. Vercel → **Add New Project** → kies de repo. Framework preset: **Other**.
   Build command en output directory leeg laten.
3. Zet bij **Settings → Environment Variables** de variabele
   `AUREX_API_BASE` = de URL van je Render-bot (bv.
   `https://aurex-development-bot.onrender.com`, zonder `/` erachter).
   `build.js` maakt hier tijdens de build `config.js` van.
4. Deploy. Je krijgt bv. `https://aurex-shop.vercel.app`.

## Daarna op Render (bot/API) instellen

- `SHOP_ORIGIN=https://aurex-shop.vercel.app` (exact je Vercel-URL, geen `/` erachter)
- Redeploy de bot. Dit zet CORS aan voor deze site, laat login-cookies
  werken en stuurt Tebex/Discord terug naar deze site.

## Gebruik

`https://jouw-shop.vercel.app/?guild=<server-id>` — de exacte link staat
in het dashboard onder het tabblad **Webshop**.

## Let op: cookies tussen twee domeinen

Op twee verschillende domeinen (`*.vercel.app` + `*.onrender.com`) is de
login-cookie een "third-party cookie". Chrome/Firefox staan dat meestal
nog toe, maar Safari en strikte privacy-instellingen blokkeren het soms,
waardoor inloggen dan niet blijft hangen. De robuuste oplossing is één
eigen domein met subdomeinen: `shop.jouwdomein.nl` (Vercel) en
`api.jouwdomein.nl` (Render).
