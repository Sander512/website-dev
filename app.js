// Losstaand van de bot/API — praat via absolute URL's met de Render-app
// (zie config.js / build.js voor AUREX_API_BASE).

const $ = (id) => document.getElementById(id);

const API_BASE = window.AUREX_API_BASE;
const GUILD_KEY = 'aurexShopGuildId';
const CART_KEY = 'aurexShopCart';

const state = {
  guildId: '',
  user: null,
  products: [],
  ownedIds: [],
  cart: loadCart(),
};

// ---------- helpers ----------
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showBanner(text, kind) {
  const el = $('banner');
  el.textContent = text;
  el.className = `shop-banner ${kind}`;
}

function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  renderCartCount();
}

// ---------- sidebar ----------
function renderCartCount() {
  const el = $('cartCount');
  el.textContent = state.cart.length;
  el.classList.toggle('hidden', state.cart.length === 0);
}

function renderUser() {
  const loginBtn = $('loginBtn');
  loginBtn.href = loginUrl();
  $('checkoutLogin').href = loginUrl();

  if (state.user) {
    loginBtn.classList.add('hidden');
    $('userBox').classList.remove('hidden');
    $('userName').textContent = `Ingelogd als ${state.user.username}`;
  } else {
    $('userBox').classList.add('hidden');
    loginBtn.classList.remove('hidden');
  }
}

// ---------- shop view ----------
function toggleCart(productId) {
  const i = state.cart.indexOf(productId);
  if (i >= 0) state.cart.splice(i, 1);
  else state.cart.push(productId);
  saveCart();
  renderProducts();
}

function renderProducts() {
  const grid = $('productGrid');
  grid.innerHTML = '';

  if (state.products.length === 0) {
    $('emptyState').classList.remove('hidden');
    return;
  }
  $('emptyState').classList.add('hidden');

  for (const p of state.products) {
    const card = document.createElement('div');
    card.className = 'product-card';

    const owned = state.ownedIds.includes(p.id);
    const inCart = state.cart.includes(p.id);

    let action;
    if (owned) action = `<span class="owned-badge">✅ Al gekocht</span>`;
    else if (inCart) action = `<button class="btn btn-ghost btn-small cart-btn" data-id="${p.id}">✓ In wagen — verwijder</button>`;
    else action = `<button class="btn btn-primary btn-small cart-btn" data-id="${p.id}">In winkelwagen</button>`;

    card.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      ${p.version ? `<span class="product-version">v${escapeHtml(p.version)}</span>` : ''}
      <p class="product-desc">${escapeHtml(p.description || '')}</p>
      <div class="product-meta">
        <span class="product-price">${formatPrice(p.priceCents, p.currency)}</span>
        ${action}
      </div>`;
    grid.appendChild(card);
  }

  grid.querySelectorAll('.cart-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleCart(btn.dataset.id));
  });
}

// ---------- cart view ----------
function cartProducts() {
  return state.cart.map((id) => state.products.find((p) => p.id === id)).filter(Boolean);
}

function renderCart() {
  const items = cartProducts().filter((p) => !state.ownedIds.includes(p.id));
  const list = $('cartList');
  list.innerHTML = '';

  $('cartEmpty').classList.toggle('hidden', items.length > 0);
  $('cartFooter').classList.toggle('hidden', items.length === 0);
  if (items.length === 0) return;

  for (const p of items) {
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div>
        <div class="cart-item-name">${escapeHtml(p.name)}</div>
        ${p.version ? `<span class="product-version">v${escapeHtml(p.version)}</span>` : ''}
      </div>
      <div class="cart-item-right">
        <span class="product-price">${formatPrice(p.priceCents, p.currency)}</span>
        <button class="btn btn-ghost btn-small" data-id="${p.id}">Verwijder</button>
      </div>`;
    list.appendChild(row);
  }

  list.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cart = state.cart.filter((id) => id !== btn.dataset.id);
      saveCart();
      renderCart();
    });
  });

  const currencies = new Set(items.map((p) => p.currency));
  if (currencies.size > 1) {
    $('cartTotal').textContent = 'Verschillende valuta — reken ze apart af';
    $('checkoutBtn').disabled = true;
  } else {
    const total = items.reduce((sum, p) => sum + p.priceCents, 0);
    $('cartTotal').textContent = formatPrice(total, items[0].currency);
    $('checkoutBtn').disabled = false;
  }

  $('checkoutBtn').classList.toggle('hidden', !state.user);
  $('checkoutLogin').classList.toggle('hidden', !!state.user);
}

$('checkoutBtn').addEventListener('click', async () => {
  const btn = $('checkoutBtn');
  const ids = cartProducts().filter((p) => !state.ownedIds.includes(p.id)).map((p) => p.id);
  btn.disabled = true;
  btn.textContent = 'Even geduld...';
  try {
    const { url } = await api('POST', '/store/checkout', { productIds: ids });
    window.location.href = url;
  } catch (err) {
    showBanner(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Afrekenen';
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await api('POST', '/auth/logout');
  location.reload();
});

// ---------- routing ----------
function showView() {
  const view = location.hash === '#/cart' ? 'cart' : 'shop';
  $('view-shop').classList.toggle('hidden', view !== 'shop');
  $('view-cart').classList.toggle('hidden', view !== 'cart');
  document.querySelectorAll('.nav-link[data-view]').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === view);
  });
  if (view === 'cart') renderCart();
}
window.addEventListener('hashchange', showView);

// ---------- start ----------
(async () => {
  renderCartCount();
  // Direct tonen, ook als er verderop iets misgaat: inloggen en routing
  // mogen nooit afhangen van het laden van de producten.
  renderUser();
  showView();

  const params = new URLSearchParams(location.search);

  let cfg = {};
  try {
    cfg = await api('GET', '/store/config');
  } catch {
    cfg = {};
  }

  if (cfg.inviteUrl) {
    const join = $('joinBtn');
    join.href = cfg.inviteUrl;
    join.classList.remove('hidden');
  }

  const fromUrl = params.get('guild');
  if (fromUrl) localStorage.setItem(GUILD_KEY, fromUrl);
  state.guildId = fromUrl || cfg.guildId || localStorage.getItem(GUILD_KEY) || '';

  if (params.get('success')) {
    state.cart = [];
    saveCart();
    showBanner('Betaling gelukt! Het kan een paar seconden duren voordat "Al gekocht" verschijnt.', 'success');
  } else if (params.get('canceled')) {
    showBanner('Afrekenen geannuleerd — er is niets in rekening gebracht.', 'info');
  } else if (params.get('login_error')) {
    showBanner('Inloggen met Discord is mislukt. Probeer het opnieuw.', 'error');
  }

  try {
    state.user = await api('GET', '/auth/me');
  } catch {
    state.user = null;
  }
  renderUser();

  if (!state.guildId) {
    $('emptyState').textContent = 'Deze shop is nog niet gekoppeld aan een server. Zet SHOP_GUILD_ID in de bot-instellingen.';
    $('emptyState').classList.remove('hidden');
    return;
  }

  try {
    ({ products: state.products } = await api('GET', `/store/products/${state.guildId}`));
  } catch (err) {
    showBanner(`Kon producten niet laden: ${err.message}`, 'error');
  }

  if (state.user) {
    try {
      ({ productIds: state.ownedIds } = await api('GET', `/store/my-purchases/${state.guildId}`));
    } catch {
      state.ownedIds = [];
    }
  }

  // Weggehaalde/inactieve producten uit een oude winkelwagen opruimen.
  state.cart = state.cart.filter((id) => state.products.some((p) => p.id === id));
  saveCart();

  $('emptyState').textContent = 'Deze shop heeft nog geen producten.';
  renderProducts();
  showView();
})();
