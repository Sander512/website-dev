// public/shop/app.js
// Losstaand van de bot/API — praat via absolute URL's met de Render-app
// (zie config.js voor API_BASE). credentials:'include' + CORS aan de
// API-kant (zie api/server.js) zorgen dat de login-cookie toch meegaat.

const $ = (id) => document.getElementById(id);

const API_BASE = window.AUREX_API_BASE;
const GUILD_KEY = 'aurexShopGuildId';

function resolveGuildId() {
  const fromUrl = new URLSearchParams(location.search).get('guild');
  if (fromUrl) {
    localStorage.setItem(GUILD_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(GUILD_KEY) || '';
}

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function loginUrl() {
  return `${API_BASE}/auth/discord?from=shop&return=${encodeURIComponent(location.origin + location.pathname)}`;
}

function formatPrice(cents, currency) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

function showBanner(text, kind) {
  const el = $('banner');
  el.textContent = text;
  el.className = `shop-banner ${kind}`;
  el.classList.remove('hidden');
}

function renderLoggedOut() {
  $('userBox').classList.add('hidden');
  const loginBtn = $('loginBtn');
  loginBtn.classList.remove('hidden');
  loginBtn.href = loginUrl();
}

function renderLoggedIn(user) {
  $('loginBtn').classList.add('hidden');
  $('userBox').classList.remove('hidden');
  $('userName').textContent = `Ingelogd als ${user.username}`;
}

async function handleBuy(productId, btn) {
  btn.disabled = true;
  btn.textContent = 'Even geduld...';
  try {
    const { url } = await api('POST', '/store/checkout', { productId });
    window.location.href = url;
  } catch (err) {
    showBanner(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Kopen';
  }
}

function renderProducts(products, ownedIds, loggedIn) {
  const grid = $('productGrid');
  grid.innerHTML = '';

  if (products.length === 0) {
    $('emptyState').textContent = 'Deze shop heeft nog geen producten.';
    $('emptyState').classList.remove('hidden');
    return;
  }
  $('emptyState').classList.add('hidden');

  for (const p of products) {
    const card = document.createElement('div');
    card.className = 'product-card';

    const owned = ownedIds.includes(p.id);

    let actionHtml;
    if (owned) {
      actionHtml = `<span class="owned-badge">✅ Al gekocht</span>`;
    } else if (!loggedIn) {
      actionHtml = `<a class="btn btn-discord btn-small" href="${loginUrl()}">Login om te kopen</a>`;
    } else {
      actionHtml = `<button class="btn btn-primary btn-small buy-btn" data-id="${p.id}">Kopen</button>`;
    }

    card.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      ${p.version ? `<span class="product-version">v${escapeHtml(p.version)}</span>` : ''}
      <p class="product-desc">${escapeHtml(p.description || '')}</p>
      <div class="product-meta">
        <span class="product-price">${formatPrice(p.priceCents, p.currency)}</span>
        ${actionHtml}
      </div>
    `;
    grid.appendChild(card);
  }

  grid.querySelectorAll('.buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleBuy(btn.dataset.id, btn));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

$('logoutBtn').addEventListener('click', async () => {
  await api('POST', '/auth/logout');
  location.reload();
});

(async () => {
  const guildId = resolveGuildId();
  const params = new URLSearchParams(location.search);

  if (params.get('success')) {
    showBanner('Betaling gelukt! Het kan een paar seconden duren voordat "Al gekocht" hieronder verschijnt.', 'success');
  } else if (params.get('canceled')) {
    showBanner('Afrekenen geannuleerd — er is niets in rekening gebracht.', 'info');
  } else if (params.get('login_error')) {
    showBanner('Inloggen met Discord is mislukt. Probeer het opnieuw.', 'error');
  }

  if (!guildId) {
    $('emptyState').textContent = 'Geen shop opgegeven — open deze pagina via de link uit het dashboard (?guild=...).';
    $('emptyState').classList.remove('hidden');
    return;
  }

  let user = null;
  try {
    user = await api('GET', '/auth/me');
  } catch {
    user = null;
  }

  if (user) renderLoggedIn(user);
  else renderLoggedOut();

  let products = [];
  try {
    ({ products } = await api('GET', `/store/products/${guildId}`));
  } catch (err) {
    showBanner(`Kon producten niet laden: ${err.message}`, 'error');
  }

  let ownedIds = [];
  if (user) {
    try {
      ({ productIds: ownedIds } = await api('GET', `/store/my-purchases/${guildId}`));
    } catch {
      ownedIds = [];
    }
  }

  renderProducts(products, ownedIds, !!user);
})();
