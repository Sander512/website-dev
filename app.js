// Losstaand van de bot/API — praat via absolute URL's met de Render-app
// (zie config.js / build.js voor AUREX_API_BASE).

const $ = (id) => document.getElementById(id);

const API_BASE = window.AUREX_API_BASE;
const GUILD_KEY = 'aurexShopGuildId';
const CART_KEY = 'aurexShopCart';

const state = {
  guildId: '',
  user: null,
  products: [], // nieuwste eerst
  ownedIds: [],
  cart: loadCart(),
  filter: { category: null, maxPrice: null, search: '', sort: 'newest' },
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
  if (cents === 0) return 'Gratis';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

// Kleine DOM-helper: tekst gaat altijd via textContent, dus nooit als HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function imageEl(url, alt) {
  const img = document.createElement('img');
  img.src = url;
  img.alt = alt || '';
  img.loading = 'lazy';
  return img;
}

function placeholder(name) {
  return el('div', 'thumb-placeholder', (name || '?').trim().charAt(0).toUpperCase());
}

function showBanner(text, kind) {
  const b = $('banner');
  b.textContent = text;
  b.className = `shop-banner ${kind}`;
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

function isOwned(id) { return state.ownedIds.includes(id); }
function inCart(id) { return state.cart.includes(id); }

function toggleCart(id) {
  const i = state.cart.indexOf(id);
  if (i >= 0) state.cart.splice(i, 1);
  else state.cart.push(id);
  saveCart();
  render();
}

function loginErrorMessage(code) {
  const messages = {
    access_denied: 'Je hebt het inloggen geannuleerd.',
    invalid_state: 'Inloggen mislukt: de beveiligingscode klopte niet. Sta cookies toe en probeer het opnieuw (niet te lang wachten op de Discord-pagina).',
    token_exchange_failed: 'Inloggen mislukt: Discord weigerde de aanvraag. De beheerder moet DISCORD_CLIENT_SECRET en de redirect-URL in Discord controleren.',
  };
  return messages[code] || `Inloggen met Discord is mislukt (${code}).`;
}

// ---------- topbar ----------
function renderCartCount() {
  const c = $('cartCount');
  c.textContent = state.cart.length;
  c.classList.toggle('hidden', state.cart.length === 0);
}

function renderUser() {
  $('loginBtn').href = loginUrl();
  $('checkoutLogin').href = loginUrl();

  if (!state.user) {
    $('userBox').classList.add('hidden');
    $('loginBtn').classList.remove('hidden');
    return;
  }

  $('loginBtn').classList.add('hidden');
  $('userBox').classList.remove('hidden');
  $('userName').textContent = state.user.username;

  const avatar = $('userAvatar');
  if (state.user.avatar) {
    avatar.textContent = '';
    avatar.style.backgroundImage = `url(https://cdn.discordapp.com/avatars/${state.user.discordId}/${state.user.avatar}.png?size=64)`;
  } else {
    avatar.style.backgroundImage = '';
    avatar.textContent = state.user.username.charAt(0).toUpperCase();
  }
}

// ---------- product card ----------
function productCard(p) {
  const card = el('div', 'product-card');
  const goto = () => { location.hash = `#/product/${encodeURIComponent(p.id)}`; };

  const thumb = el('a', 'product-thumb');
  thumb.addEventListener('click', goto);
  thumb.appendChild(p.imageUrls[0] ? imageEl(p.imageUrls[0], p.name) : placeholder(p.name));
  if (p.category) thumb.appendChild(el('span', 'thumb-tag', p.category));
  card.appendChild(thumb);

  const body = el('div', 'product-body');
  const name = el('h3', 'product-name', p.name);
  name.addEventListener('click', goto);
  body.appendChild(name);
  body.appendChild(el('div', 'product-price', formatPrice(p.priceCents, p.currency)));
  card.appendChild(body);

  const foot = el('div', 'product-foot');
  if (isOwned(p.id)) {
    foot.appendChild(el('span', 'owned-badge', '✅ Al gekocht'));
  } else {
    const btn = el('button', inCart(p.id) ? 'btn btn-outline' : 'btn btn-light', inCart(p.id) ? '✓ In wagen — verwijder' : (p.priceCents === 0 ? 'Gratis ophalen' : 'In winkelwagen'));
    btn.addEventListener('click', () => toggleCart(p.id));
    foot.appendChild(btn);
  }
  card.appendChild(foot);
  return card;
}

// ---------- views ----------
function renderHome() {
  const grid = $('homeGrid');
  grid.textContent = '';
  const latest = state.products.slice(0, 4);
  if (latest.length === 0) {
    grid.appendChild(el('p', 'muted', 'Er staan nog geen producten in de shop.'));
    return;
  }
  latest.forEach((p) => grid.appendChild(productCard(p)));
}

function visibleProducts() {
  const { category, maxPrice, search, sort } = state.filter;
  const q = search.trim().toLowerCase();

  let list = state.products.filter((p) => {
    if (category && p.category !== category) return false;
    if (maxPrice !== null && p.priceCents > maxPrice * 100) return false;
    if (q && !(`${p.name} ${p.description}`.toLowerCase().includes(q))) return false;
    return true;
  });

  if (sort === 'price-asc') list = [...list].sort((a, b) => a.priceCents - b.priceCents);
  else if (sort === 'price-desc') list = [...list].sort((a, b) => b.priceCents - a.priceCents);
  else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function renderShop() {
  // Categorieën met aantallen
  const counts = new Map();
  state.products.forEach((p) => { if (p.category) counts.set(p.category, (counts.get(p.category) || 0) + 1); });

  const cats = $('categoryList');
  cats.textContent = '';
  const addCat = (label, value, count) => {
    const b = el('button', `category-btn${state.filter.category === value ? ' active' : ''}`);
    b.appendChild(el('span', '', label));
    b.appendChild(el('span', 'count', String(count)));
    b.addEventListener('click', () => { state.filter.category = value; renderShop(); });
    cats.appendChild(b);
  };
  addCat('Alles', null, state.products.length);
  [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([c, n]) => addCat(c, c, n));

  // Prijsslider: maximum = duurste product (afgerond omhoog, in hele euro's)
  const top = Math.max(1, Math.ceil(Math.max(0, ...state.products.map((p) => p.priceCents)) / 100));
  const range = $('priceRange');
  range.max = String(top);
  if (state.filter.maxPrice === null || state.filter.maxPrice > top) state.filter.maxPrice = top;
  range.value = String(state.filter.maxPrice);
  $('priceMaxLabel').textContent = `€${state.filter.maxPrice}`;

  // Grid
  const list = visibleProducts();
  const grid = $('productGrid');
  grid.textContent = '';
  list.forEach((p) => grid.appendChild(productCard(p)));
  $('emptyState').classList.toggle('hidden', list.length > 0);
  $('emptyState').textContent = state.products.length === 0 ? 'Er staan nog geen producten in de shop.' : 'Geen producten gevonden met deze filters.';
  $('resultCount').textContent = list.length > 0 ? `${list.length} ${list.length === 1 ? 'product' : 'producten'}` : '';
}

function renderProduct(id) {
  const box = $('productDetail');
  box.textContent = '';
  const p = state.products.find((x) => x.id === id);
  if (!p) {
    box.appendChild(el('p', 'muted', 'Dit product bestaat niet (meer).'));
    return;
  }

  const wrap = el('div', 'detail');

  // Galerij
  const images = p.imageUrls;
  const gallery = el('div', `gallery${images.length > 1 ? '' : ' single'}`);
  const main = el('div', 'main-image');
  const setMain = (i) => {
    main.textContent = '';
    main.appendChild(images[i] ? imageEl(images[i], p.name) : placeholder(p.name));
  };
  setMain(0);

  if (images.length > 1) {
    const thumbs = el('div', 'thumbs');
    images.forEach((url, i) => {
      const b = el('button', i === 0 ? 'active' : '');
      b.appendChild(imageEl(url, `${p.name} ${i + 1}`));
      b.addEventListener('click', () => {
        thumbs.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        setMain(i);
      });
      thumbs.appendChild(b);
    });
    gallery.appendChild(thumbs);
  }
  gallery.appendChild(main);
  wrap.appendChild(gallery);

  // Info
  const info = el('div');
  const kicker = el('div', 'detail-kicker');
  if (p.category) kicker.appendChild(el('span', 'cat-chip', p.category));
  if (p.version) kicker.appendChild(el('span', 'ver-chip', `Versie ${p.version}`));
  info.appendChild(kicker);
  info.appendChild(el('h1', '', p.name));

  const pills = el('div', 'detail-pills');
  ['Direct geleverd', 'Update-DM\'s', 'Veilig via Stripe'].forEach((t) => pills.appendChild(el('span', 'pill', t)));
  info.appendChild(pills);

  info.appendChild(el('p', 'detail-price', formatPrice(p.priceCents, p.currency)));

  const actions = el('div', 'detail-actions');
  if (isOwned(p.id)) {
    actions.appendChild(el('span', 'owned-badge', '✅ Al gekocht'));
    const dl = el('a', 'btn btn-light', 'Download bestand');
    dl.href = `${API_BASE}/store/download/${encodeURIComponent(p.id)}`;
    actions.appendChild(dl);
  } else {
    const btn = el('button', inCart(p.id) ? 'btn btn-outline' : 'btn btn-light', inCart(p.id) ? '✓ In wagen — verwijder' : (p.priceCents === 0 ? 'Gratis ophalen' : 'In winkelwagen'));
    btn.addEventListener('click', () => toggleCart(p.id));
    actions.appendChild(btn);
  }
  info.appendChild(actions);

  if (p.description) {
    const s = el('div', 'detail-section');
    s.appendChild(el('h3', '', 'Omschrijving'));
    s.appendChild(el('p', 'detail-text', p.description));
    info.appendChild(s);
  }
  if (p.changelog) {
    const s = el('div', 'detail-section');
    s.appendChild(el('h3', '', 'Changelog'));
    s.appendChild(el('p', 'detail-text', p.changelog));
    info.appendChild(s);
  }

  wrap.appendChild(info);
  box.appendChild(wrap);
}

function renderCart() {
  const items = state.cart
    .map((id) => state.products.find((p) => p.id === id))
    .filter((p) => p && !isOwned(p.id));

  const list = $('cartList');
  list.textContent = '';
  $('cartEmpty').classList.toggle('hidden', items.length > 0);
  $('cartFooter').classList.toggle('hidden', items.length === 0);
  if (items.length === 0) return;

  items.forEach((p) => {
    const row = el('div', 'cart-item');
    const thumb = el('div', 'cart-thumb');
    thumb.appendChild(p.imageUrls[0] ? imageEl(p.imageUrls[0], p.name) : placeholder(p.name));
    row.appendChild(thumb);

    const info = el('div', 'cart-item-info');
    info.appendChild(el('div', 'cart-item-name', p.name));
    if (p.version) info.appendChild(el('div', 'muted', `Versie ${p.version}`));
    row.appendChild(info);

    const right = el('div', 'cart-item-right');
    right.appendChild(el('span', 'product-price', formatPrice(p.priceCents, p.currency)));
    const rm = el('button', 'btn btn-ghost btn-small', 'Verwijder');
    rm.addEventListener('click', () => toggleCart(p.id));
    right.appendChild(rm);
    row.appendChild(right);
    list.appendChild(row);
  });

  const mixed = new Set(items.map((p) => p.currency)).size > 1;
  if (mixed) {
    $('cartTotal').textContent = 'Verschillende valuta — reken ze apart af';
  } else {
    $('cartTotal').textContent = formatPrice(items.reduce((s, p) => s + p.priceCents, 0), items[0].currency);
  }
  $('checkoutBtn').textContent = items.every((p) => p.priceCents === 0) ? 'Gratis ophalen' : 'Afrekenen';
  $('checkoutBtn').disabled = mixed;
  $('checkoutBtn').classList.toggle('hidden', !state.user);
  $('checkoutLogin').classList.toggle('hidden', !!state.user);
}

// ---------- routing ----------
function currentRoute() {
  const h = location.hash || '#/';
  if (h.startsWith('#/product/')) return { view: 'product', id: decodeURIComponent(h.slice('#/product/'.length)) };
  if (h === '#/shop') return { view: 'shop' };
  if (h === '#/cart') return { view: 'cart' };
  return { view: 'home' };
}

function render() {
  const route = currentRoute();
  ['home', 'shop', 'product', 'cart'].forEach((v) => $(`view-${v}`).classList.toggle('hidden', v !== route.view));
  document.querySelectorAll('.topnav a[data-view]').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === (route.view === 'product' ? 'shop' : route.view));
  });

  if (route.view === 'home') renderHome();
  if (route.view === 'shop') renderShop();
  if (route.view === 'product') renderProduct(route.id);
  if (route.view === 'cart') renderCart();
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ---------- events ----------
$('sortSelect').addEventListener('change', (e) => { state.filter.sort = e.target.value; renderShop(); });
$('searchInput').addEventListener('input', (e) => { state.filter.search = e.target.value; renderShop(); });
$('priceRange').addEventListener('input', (e) => { state.filter.maxPrice = Number(e.target.value); renderShop(); });

$('checkoutBtn').addEventListener('click', async () => {
  const btn = $('checkoutBtn');
  const ids = state.cart.filter((id) => state.products.some((p) => p.id === id) && !isOwned(id));
  btn.disabled = true;
  btn.textContent = 'Even geduld...';
  try {
    const result = await api('POST', '/store/checkout', { productIds: ids });
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    // Alleen gratis producten: direct afgehandeld, bestand komt per DM.
    state.cart = state.cart.filter((id) => !ids.includes(id));
    saveCart();
    try { ({ productIds: state.ownedIds } = await api('GET', `/store/my-purchases/${state.guildId}`)); } catch { /* laat staan */ }
    showBanner('Gelukt! Je bestand is onderweg per privébericht (DM) van de Aurex-bot. Kom je niets binnen, controleer dan of je DM\'s van serverleden hebt toegestaan — je kunt het bestand ook hier downloaden.', 'success');
    btn.disabled = false;
    btn.textContent = 'Afrekenen';
    location.hash = '#/shop';
    render();
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

// ---------- start ----------
(async () => {
  // Meteen tonen, zodat inloggen en navigatie nooit wachten op producten.
  renderCartCount();
  renderUser();
  render();

  const params = new URLSearchParams(location.search);

  let cfg = {};
  try { cfg = await api('GET', '/store/config'); } catch { cfg = {}; }

  if (cfg.inviteUrl) {
    $('joinBtn').href = cfg.inviteUrl;
    $('joinBtn').classList.remove('hidden');
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
    showBanner(loginErrorMessage(params.get('login_error')), 'error');
  }

  try { state.user = await api('GET', '/auth/me'); } catch { state.user = null; }
  renderUser();

  if (!state.guildId) {
    showBanner('Deze shop is nog niet gekoppeld aan een server. Zet SHOP_GUILD_ID in de bot-instellingen.', 'error');
    return;
  }

  try {
    const { products } = await api('GET', `/store/products/${state.guildId}`);
    state.products = [...products].reverse(); // API geeft oudste eerst; wij tonen nieuwste eerst
  } catch (err) {
    showBanner(`Kon producten niet laden: ${err.message}`, 'error');
  }

  if (state.user) {
    try { ({ productIds: state.ownedIds } = await api('GET', `/store/my-purchases/${state.guildId}`)); } catch { state.ownedIds = []; }
  }

  // Verdwenen/inactieve producten uit een oude winkelwagen halen.
  state.cart = state.cart.filter((id) => state.products.some((p) => p.id === id));
  saveCart();
  render();
})();
