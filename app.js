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
  orders: null,
  cart: loadCart(),
  bundles: [],
  quote: null, // laatste prijs-quote van de server (bundel- en codekorting)
  quoteKey: '',
  discountCode: '',
  myReviews: null, // { productId: { rating, body } } — null = nog niet geladen
  reviewFilter: '',
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
    rate_limited: 'Discord is op dit moment tijdelijk overbelast. Wacht een paar minuten en probeer opnieuw in te loggen.',
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

// ---------- reviews & sterren ----------
const NEW_DAYS = 14;

function starsText(n) {
  const full = Math.max(0, Math.min(5, Math.round(n)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function dateLabel(ms) {
  return new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ratingLine(avg, count) {
  const box = el('span', 'rating');
  box.appendChild(el('span', 'stars', starsText(avg)));
  box.appendChild(el('span', 'rating-num', `${avg.toFixed(1)} (${count})`));
  return box;
}

async function refreshProducts() {
  try {
    const { products } = await api('GET', `/store/products/${state.guildId}`);
    state.products = [...products].reverse();
  } catch { /* oude lijst blijft staan */ }
}

async function loadMyReviews(force) {
  if (!state.user) return {};
  if (state.myReviews && !force) return state.myReviews;
  try {
    ({ reviews: state.myReviews } = await api('GET', `/store/my-reviews/${state.guildId}`));
  } catch {
    state.myReviews = {};
  }
  return state.myReviews;
}

function starPicker(initial) {
  let value = initial || 0;
  const box = el('div', 'star-picker');
  const btns = [];
  const paint = (hover) => btns.forEach((b, idx) => b.classList.toggle('on', idx < (hover === undefined ? value : hover)));
  for (let i = 1; i <= 5; i++) {
    const b = el('button', 'star-btn', '★');
    b.type = 'button';
    b.setAttribute('aria-label', `${i} ${i === 1 ? 'ster' : 'sterren'}`);
    b.addEventListener('click', () => { value = i; paint(); });
    b.addEventListener('mouseenter', () => paint(i));
    btns.push(b);
    box.appendChild(b);
  }
  box.addEventListener('mouseleave', () => paint());
  paint();
  return { node: box, get: () => value };
}

function reviewForm(product, existing, onDone) {
  const form = el('div', 'review-form');
  form.appendChild(el('div', 'review-form-title', existing ? 'Je review aanpassen' : `Wat vind je van ${product.name}?`));
  const picker = starPicker(existing ? existing.rating : 0);
  form.appendChild(picker.node);

  const ta = document.createElement('textarea');
  ta.rows = 4;
  ta.maxLength = 1000;
  ta.placeholder = 'Vertel andere kopers wat je ervan vindt (optioneel)';
  ta.value = existing ? existing.body || '' : '';
  form.appendChild(ta);
  form.appendChild(el('p', 'muted review-hint', 'Je Discord-naam wordt bij je review getoond.'));

  const msg = el('div', 'review-msg');
  const actions = el('div', 'review-actions');
  const save = el('button', 'btn btn-light btn-small', existing ? 'Opslaan' : 'Review plaatsen');
  save.type = 'button';
  save.addEventListener('click', async () => {
    if (!picker.get()) {
      msg.textContent = 'Kies eerst een aantal sterren.';
      msg.className = 'review-msg error';
      return;
    }
    save.disabled = true;
    msg.textContent = '';
    try {
      const body = ta.value.trim();
      await api('POST', '/store/reviews', { productId: product.id, rating: picker.get(), body });
      state.myReviews = state.myReviews || {};
      state.myReviews[product.id] = { rating: picker.get(), body };
      await refreshProducts();
      onDone();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'review-msg error';
      save.disabled = false;
    }
  });
  actions.appendChild(save);

  if (existing) {
    const del = el('button', 'btn btn-ghost btn-small', 'Verwijderen');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!confirm('Je review verwijderen?')) return;
      try {
        await api('DELETE', `/store/reviews/${encodeURIComponent(product.id)}`);
        if (state.myReviews) delete state.myReviews[product.id];
        await refreshProducts();
        onDone();
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'review-msg error';
      }
    });
    actions.appendChild(del);
  }
  form.append(actions, msg);
  return form;
}

function reviewCard(r, showProduct) {
  const card = el('article', 'review-card');
  const top = el('div', 'review-top');
  top.appendChild(el('span', 'review-avatar', (r.username || '?').charAt(0).toUpperCase()));
  const who = el('div', 'review-who');
  who.appendChild(el('strong', '', r.username));
  who.appendChild(el('span', 'review-verified', '✓ Koper'));
  top.appendChild(who);
  top.appendChild(el('span', 'review-date', dateLabel(r.createdAt)));
  card.appendChild(top);
  card.appendChild(el('div', 'stars', starsText(r.rating)));
  if (showProduct && r.productName) {
    const a = el('a', 'review-product', r.productName);
    a.href = `#/product/${encodeURIComponent(r.productId)}`;
    card.appendChild(a);
  }
  if (r.body) card.appendChild(el('p', 'review-body', r.body));
  return card;
}

function reviewSummary(summary) {
  const box = el('div', 'review-summary');
  const left = el('div', 'review-score');
  left.appendChild(el('div', 'review-score-num', summary.average.toFixed(1)));
  left.appendChild(el('div', 'stars', starsText(summary.average)));
  left.appendChild(el('div', 'muted', `${summary.count} review${summary.count === 1 ? '' : 's'}`));
  const bars = el('div', 'review-bars');
  for (let n = 5; n >= 1; n--) {
    const row = el('div', 'review-bar-row');
    row.appendChild(el('span', '', `${n}★`));
    const track = el('div', 'review-bar');
    const fill = el('div', 'review-bar-fill');
    fill.style.width = `${summary.count ? (summary.distribution[n] / summary.count) * 100 : 0}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'muted', String(summary.distribution[n])));
    bars.appendChild(row);
  }
  box.append(left, bars);
  return box;
}

// Reviews onderaan een productpagina (+ formulier voor kopers).
function buildReviewsSection(p) {
  const sec = el('section', 'reviews-section');
  sec.id = 'productReviews';
  sec.appendChild(el('h2', 'section-title', 'Reviews'));
  const summarySlot = el('div');
  const formSlot = el('div');
  const list = el('div', 'review-list');
  sec.append(summarySlot, formSlot, list);

  (async () => {
    try {
      const data = await api('GET', `/store/reviews/${state.guildId}?productId=${encodeURIComponent(p.id)}&limit=50`);
      if (data.summary.count > 0) summarySlot.appendChild(reviewSummary(data.summary));
      else list.appendChild(el('p', 'muted', 'Nog geen reviews voor dit product.'));
      data.reviews.forEach((r) => list.appendChild(reviewCard(r, false)));
    } catch {
      list.appendChild(el('p', 'muted', 'Kon de reviews niet laden.'));
    }

    if (!state.user) {
      formSlot.appendChild(el('p', 'muted review-note', 'Log in en koop dit product om een review te schrijven.'));
    } else if (!isOwned(p.id)) {
      formSlot.appendChild(el('p', 'muted review-note', 'Alleen kopers van dit product kunnen een review schrijven.'));
    } else {
      const mine = await loadMyReviews();
      formSlot.appendChild(reviewForm(p, mine[p.id] || null, () => render()));
    }
  })();

  return sec;
}

let reviewsToken = 0;
async function renderReviewsPage() {
  const box = $('reviewsBody');
  const token = ++reviewsToken;
  box.textContent = '';
  box.appendChild(el('p', 'muted', 'Laden...'));

  let data;
  try {
    const q = state.reviewFilter ? `?productId=${encodeURIComponent(state.reviewFilter)}&limit=100` : '?limit=100';
    data = await api('GET', `/store/reviews/${state.guildId}${q}`);
  } catch (err) {
    if (token === reviewsToken) { box.textContent = ''; box.appendChild(el('p', 'muted', `Kon reviews niet laden: ${err.message}`)); }
    return;
  }
  if (token !== reviewsToken) return;
  box.textContent = '';

  // Filter op product
  const bar = el('div', 'reviews-toolbar');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Filter op product');
  const all = el('option', '', 'Alle producten');
  all.value = '';
  select.appendChild(all);
  state.products.forEach((p) => {
    const o = el('option', '', p.name);
    o.value = p.id;
    select.appendChild(o);
  });
  select.value = state.reviewFilter;
  select.addEventListener('change', () => { state.reviewFilter = select.value; renderReviewsPage(); });
  bar.appendChild(select);

  if (data.summary.count === 0) {
    box.appendChild(bar);
    box.appendChild(el('p', 'muted empty', 'Er zijn nog geen reviews.'));
    return;
  }
  box.appendChild(reviewSummary(data.summary));
  box.appendChild(bar);
  const list = el('div', 'review-list');
  data.reviews.forEach((r) => list.appendChild(reviewCard(r, true)));
  box.appendChild(list);
}

// ---------- bundels ----------
function bundleCard(b) {
  const card = el('div', 'bundle-card');

  const covers = el('div', 'bundle-covers');
  b.products.slice(0, 3).forEach((bp) => {
    const c = el('div', 'bundle-cover');
    c.appendChild(bp.imageUrl ? imageEl(bp.imageUrl, bp.name) : placeholder(bp.name));
    covers.appendChild(c);
  });
  card.appendChild(covers);

  const body = el('div', 'bundle-body');
  const head = el('div', 'bundle-head');
  head.appendChild(el('h3', 'bundle-name', b.name));
  head.appendChild(el('span', 'bundle-badge', `−${b.discountPercent}%`));
  body.appendChild(head);
  if (b.description) body.appendChild(el('p', 'muted bundle-desc', b.description));
  body.appendChild(el('div', 'bundle-items', b.products.map((x) => x.name).join(' + ')));

  const foot = el('div', 'bundle-foot');
  const price = el('div', 'bundle-price');
  price.appendChild(el('span', 'price-old', formatPrice(b.originalCents, b.currency)));
  price.appendChild(el('span', 'product-price', formatPrice(b.finalCents, b.currency)));
  foot.appendChild(price);

  const owned = b.products.filter((x) => isOwned(x.id)).length;
  const allInCart = b.products.every((x) => inCart(x.id));
  if (owned > 0) {
    foot.appendChild(el('span', 'muted bundle-note', 'Je hebt hier al een product van'));
  } else {
    const btn = el('button', allInCart ? 'btn btn-outline btn-small' : 'btn btn-light btn-small', allInCart ? '✓ In wagen — bekijk' : 'Bundel in winkelwagen');
    btn.addEventListener('click', () => {
      if (allInCart) { location.hash = '#/cart'; return; }
      b.products.forEach((x) => { if (!state.cart.includes(x.id)) state.cart.push(x.id); });
      saveCart();
      render();
    });
    foot.appendChild(btn);
  }
  body.appendChild(foot);
  card.appendChild(body);
  return card;
}

function renderBundles(containerId) {
  const box = $(containerId);
  if (!box) return;
  box.textContent = '';
  const bundles = state.bundles.filter((b) => b.products.every((bp) => state.products.some((p) => p.id === bp.id)));
  box.classList.toggle('hidden', bundles.length === 0);
  if (bundles.length === 0) return;
  box.appendChild(el('h2', 'section-title', 'Bundels — voordeliger samen'));
  const grid = el('div', 'bundle-grid');
  bundles.forEach((b) => grid.appendChild(bundleCard(b)));
  box.appendChild(grid);
}

// ---------- product card ----------
function productCard(p) {
  const card = el('div', 'product-card');
  const goto = () => { location.hash = `#/product/${encodeURIComponent(p.id)}`; };

  const thumb = el('a', 'product-thumb');
  thumb.addEventListener('click', goto);
  thumb.appendChild(p.imageUrls[0] ? imageEl(p.imageUrls[0], p.name) : placeholder(p.name));
  // Tweede foto verschijnt als je er met de muis overheen gaat.
  if (p.imageUrls[1]) {
    const alt = imageEl(p.imageUrls[1], `${p.name} 2`);
    alt.classList.add('thumb-alt');
    thumb.appendChild(alt);
  }
  if (p.category) thumb.appendChild(el('span', 'thumb-tag', p.category));

  // Labels: Gratis / Bestseller / Nieuw
  const badges = el('div', 'thumb-badges');
  if (p.priceCents === 0) badges.appendChild(el('span', 'badge badge-free', 'Gratis'));
  else if (p.isBestseller) badges.appendChild(el('span', 'badge badge-hot', '🏆 Bestseller'));
  if (p.createdAt && Date.now() - p.createdAt < NEW_DAYS * 86400000) badges.appendChild(el('span', 'badge badge-new', 'Nieuw'));
  if (badges.childNodes.length) thumb.appendChild(badges);
  card.appendChild(thumb);

  const body = el('div', 'product-body');
  const name = el('h3', 'product-name', p.name);
  name.addEventListener('click', goto);
  body.appendChild(name);
  if (p.ratingCount > 0) body.appendChild(ratingLine(p.ratingAvg, p.ratingCount));
  body.appendChild(el('div', 'product-price', formatPrice(p.priceCents, p.currency)));
  card.appendChild(body);

  const foot = el('div', 'product-foot');
  if (isOwned(p.id)) {
    const row = el('div', 'owned-row');
    row.appendChild(el('span', 'owned-pill', '✓ Gekocht'));
    const dl = el('a', 'btn btn-light btn-small', 'Download');
    dl.href = `${API_BASE}/store/download/${encodeURIComponent(p.id)}`;
    row.appendChild(dl);
    foot.appendChild(row);
  } else {
    const btn = el('button', inCart(p.id) ? 'btn btn-outline' : 'btn btn-light', inCart(p.id) ? '✓ In wagen — verwijder' : (p.priceCents === 0 ? 'Gratis ophalen' : 'In winkelwagen'));
    btn.addEventListener('click', () => toggleCart(p.id));
    foot.appendChild(btn);
  }
  card.appendChild(foot);
  return card;
}

// ---------- views ----------
let heroSellerLoaded = false;

async function renderHeroSeller() {
  const box = $('heroSeller');
  if (!box || heroSellerLoaded) return;
  heroSellerLoaded = true;

  let product = null;
  let sales = 0;
  try {
    ({ product, sales } = await api('GET', `/store/top-seller/${state.guildId}`));
  } catch {
    heroSellerLoaded = false; // opnieuw proberen bij de volgende renderHome()
    return;
  }
  if (!product) return;

  const goto = () => { location.hash = `#/product/${encodeURIComponent(product.id)}`; };

  const back = el('div', 'seller-card seller-card-back');

  const card = el('a', 'seller-card');
  card.href = `#/product/${encodeURIComponent(product.id)}`;
  card.addEventListener('click', (e) => { e.preventDefault(); goto(); });

  const thumb = el('div', 'seller-thumb');
  thumb.appendChild(product.imageUrls[0] ? imageEl(product.imageUrls[0], product.name) : placeholder(product.name));
  card.appendChild(thumb);

  const tagRow = el('div', 'seller-tag');
  tagRow.appendChild(el('span', null, sales > 0 ? 'Bestseller' : 'Uitgelicht'));
  card.appendChild(tagRow);

  card.appendChild(el('div', 'seller-name', product.name));

  const foot = el('div', 'seller-foot');
  foot.appendChild(el('span', 'seller-price', formatPrice(product.priceCents, product.currency)));
  foot.appendChild(el('span', 'btn btn-primary btn-small', 'Bekijk'));
  card.appendChild(foot);

  box.textContent = '';
  box.appendChild(back);
  box.appendChild(card);
}

function renderHome() {
  const grid = $('homeGrid');
  grid.textContent = '';
  const latest = state.products.slice(0, 4);
  if (latest.length === 0) {
    grid.appendChild(el('p', 'muted', 'Er staan nog geen producten in de shop.'));
  } else {
    latest.forEach((p) => grid.appendChild(productCard(p)));
  }
  renderBundles('homeBundles');
  renderHeroSeller();
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
  renderBundles('shopBundles');
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
  // (Pas instellen als de producten geladen zijn; anders blijft het filter na
  // een herlaad op #/shop op €1 hangen en zie je alleen gratis producten.)
  if (state.products.length > 0) {
    const top = Math.max(1, Math.ceil(Math.max(0, ...state.products.map((p) => p.priceCents)) / 100));
    const range = $('priceRange');
    range.max = String(top);
    if (state.filter.maxPrice === null || state.filter.maxPrice > top) state.filter.maxPrice = top;
    range.value = String(state.filter.maxPrice);
    $('priceMaxLabel').textContent = `€${state.filter.maxPrice}`;
  }

  // Grid
  const list = visibleProducts();
  const grid = $('productGrid');
  grid.textContent = '';
  list.forEach((p) => grid.appendChild(productCard(p)));
  $('emptyState').classList.toggle('hidden', list.length > 0);
  $('emptyState').textContent = state.products.length === 0 ? 'Er staan nog geen producten in de shop.' : 'Geen producten gevonden met deze filters.';
  $('resultCount').textContent = list.length > 0 ? `${list.length} ${list.length === 1 ? 'product' : 'producten'}` : '';
}

// ---------- galerij ----------
// Foto's staan op volgorde: images[0] is de cover. De hoofdfoto heeft pijltjes
// (+ swipe), een klik opent de grote weergave (lightbox) met pijltjes,
// toetsenbord (← → Esc) en swipe. Beide blijven met elkaar in sync.
function arrowButton(dir) {
  const b = el('button', `gallery-arrow ${dir}`, dir === 'prev' ? '‹' : '›');
  b.type = 'button';
  b.setAttribute('aria-label', dir === 'prev' ? 'Vorige foto' : 'Volgende foto');
  return b;
}

function onSwipe(node, handler) {
  let startX = null;
  node.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  node.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) handler(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function preload(url) {
  if (url) new Image().src = url;
}

let lightboxEl = null;

function openLightbox(images, startIndex, name, onChange) {
  if (lightboxEl) return;
  let index = startIndex;
  const previouslyFocused = document.activeElement;

  const box = el('div', 'lightbox');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', `Foto's van ${name}`);

  const stage = el('div', 'lightbox-stage');
  const img = document.createElement('img');
  img.alt = name;
  stage.appendChild(img);

  const closeBtn = el('button', 'lightbox-close', '✕');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Sluiten');
  const counter = el('div', 'lightbox-counter');
  const prev = arrowButton('prev');
  const next = arrowButton('next');

  const render = () => {
    img.src = images[index];
    counter.textContent = `${index + 1} / ${images.length}`;
    preload(images[(index + 1) % images.length]);
    preload(images[(index - 1 + images.length) % images.length]);
    onChange(index);
  };
  const go = (d) => {
    index = (index + d + images.length) % images.length;
    render();
  };

  const close = () => {
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('no-scroll');
    box.remove();
    lightboxEl = null;
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };

  prev.addEventListener('click', (e) => { e.stopPropagation(); go(-1); });
  next.addEventListener('click', (e) => { e.stopPropagation(); go(1); });
  closeBtn.addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box || e.target === stage) close(); });
  onSwipe(stage, go);

  box.append(closeBtn, stage, counter);
  if (images.length > 1) box.append(prev, next);
  document.body.appendChild(box);
  document.body.classList.add('no-scroll');
  document.addEventListener('keydown', onKey);
  lightboxEl = box;
  render();
  closeBtn.focus();
}

function buildGallery(p) {
  const images = p.imageUrls || [];
  const multi = images.length > 1;
  const gallery = el('div', `gallery${multi ? '' : ' single'}`);
  const main = el('div', 'main-image');
  let index = 0;
  const thumbButtons = [];

  const show = (i) => {
    index = (i + images.length) % Math.max(images.length, 1);
    main.querySelectorAll('.main-photo, .thumb-placeholder').forEach((n) => n.remove());
    if (images[index]) {
      const img = imageEl(images[index], `${p.name} ${index + 1}`);
      img.loading = 'eager';
      img.classList.add('main-photo');
      main.insertBefore(img, main.firstChild);
    } else {
      main.insertBefore(placeholder(p.name), main.firstChild);
    }
    if (multi) {
      counter.textContent = `${index + 1} / ${images.length}`;
      thumbButtons.forEach((b, n) => b.classList.toggle('active', n === index));
      preload(images[(index + 1) % images.length]);
      preload(images[(index - 1 + images.length) % images.length]);
    }
  };

  const counter = el('div', 'gallery-counter');

  if (images.length > 0) {
    main.classList.add('zoomable');
    main.setAttribute('role', 'button');
    main.tabIndex = 0;
    main.setAttribute('aria-label', 'Foto vergroten');
    const open = () => openLightbox(images, index, p.name, (i) => { if (i !== index) show(i); });
    main.addEventListener('click', open);
    main.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      else if (multi && e.key === 'ArrowLeft') show(index - 1);
      else if (multi && e.key === 'ArrowRight') show(index + 1);
    });
  }

  if (multi) {
    const prev = arrowButton('prev');
    const next = arrowButton('next');
    prev.addEventListener('click', (e) => { e.stopPropagation(); show(index - 1); });
    next.addEventListener('click', (e) => { e.stopPropagation(); show(index + 1); });
    main.append(prev, next, counter);
    onSwipe(main, (d) => show(index + d));

    const thumbs = el('div', 'thumbs');
    images.forEach((url, i) => {
      const b = el('button', i === 0 ? 'active' : '');
      b.type = 'button';
      b.setAttribute('aria-label', `Foto ${i + 1}`);
      b.appendChild(imageEl(url, `${p.name} ${i + 1}`));
      b.addEventListener('click', () => show(i));
      thumbs.appendChild(b);
      thumbButtons.push(b);
    });
    gallery.appendChild(thumbs);
  }

  show(0);
  gallery.appendChild(main);
  return gallery;
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

  // Galerij (eerste foto = cover; pijltjes, swipe en grote weergave)
  const gallery = buildGallery(p);
  wrap.appendChild(gallery);

  // Info
  const info = el('div');
  const kicker = el('div', 'detail-kicker');
  if (p.category) kicker.appendChild(el('span', 'cat-chip', p.category));
  if (p.version) kicker.appendChild(el('span', 'ver-chip', `Versie ${p.version}`));
  info.appendChild(kicker);
  info.appendChild(el('h1', '', p.name));
  if (p.ratingCount > 0) {
    const r = ratingLine(p.ratingAvg, p.ratingCount);
    r.classList.add('rating-link');
    r.addEventListener('click', () => { const t = $('productReviews'); if (t) t.scrollIntoView({ behavior: 'smooth' }); });
    info.appendChild(r);
  }

  const pills = el('div', 'detail-pills');
  ['Direct geleverd', 'Update-DM\'s', 'Veilig via Stripe'].forEach((t) => pills.appendChild(el('span', 'pill', t)));
  info.appendChild(pills);

  info.appendChild(el('p', 'detail-price', formatPrice(p.priceCents, p.currency)));

  const actions = el('div', 'detail-actions');
  if (isOwned(p.id)) {
    const row = el('div', 'owned-row');
    row.appendChild(el('span', 'owned-pill', '✓ Al gekocht'));
    const dl = el('a', 'btn btn-light', 'Download bestand');
    dl.href = `${API_BASE}/store/download/${encodeURIComponent(p.id)}`;
    row.appendChild(dl);
    actions.appendChild(row);
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
  box.appendChild(buildReviewsSection(p));
}

function orderDateLabel(ms) {
  return new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function renderAccount() {
  const list = $('accountList');
  list.textContent = '';
  $('accountEmpty').classList.add('hidden');

  if (!state.user) {
    location.hash = '#/';
    return;
  }

  if (state.orders === null) {
    list.appendChild(el('p', 'muted', 'Laden...'));
    try {
      ({ orders: state.orders } = await api('GET', `/store/my-orders/${state.guildId}`));
    } catch (err) {
      list.textContent = '';
      list.appendChild(el('p', 'muted', `Kon je aankopen niet laden: ${err.message}`));
      return;
    }
    list.textContent = '';
  }

  if (state.orders.length === 0) {
    $('accountEmpty').classList.remove('hidden');
    return;
  }

  await loadMyReviews();

  state.orders.forEach((o) => {
    const row = el('div', 'order-item');

    const thumb = el('div', 'order-thumb');
    thumb.appendChild(o.imageUrl ? imageEl(o.imageUrl, o.name) : placeholder(o.name));
    row.appendChild(thumb);

    const info = el('div', 'order-info');
    info.appendChild(el('div', 'order-name', o.name));
    const metaBits = [orderDateLabel(o.purchasedAt)];
    if (o.version) metaBits.push(`v${o.version}`);
    metaBits.push(o.paidCents === 0 ? 'Gratis' : formatPrice(o.paidCents, o.currency));
    if (!o.stillListed) metaBits.push('niet meer in de shop');
    info.appendChild(el('div', 'muted order-meta', metaBits.join(' · ')));
    row.appendChild(info);

    if (o.hasFile && o.stillListed) {
      const dl = el('a', 'btn btn-light btn-small', 'Download');
      dl.href = `${API_BASE}/store/download/${encodeURIComponent(o.id)}`;
      row.appendChild(dl);
    } else if (!o.stillListed) {
      row.appendChild(el('span', 'muted', 'Niet meer beschikbaar'));
    } else {
      row.appendChild(el('span', 'muted', 'Geen bestand'));
    }

    // Review schrijven (alleen kopers van producten die nog in de shop staan)
    if (o.stillListed) {
      const mine = (state.myReviews || {})[o.id];
      const prod = state.products.find((p) => p.id === o.id) || { id: o.id, name: o.name };
      const reviewBox = el('div', 'order-review');
      const toggle = el('button', 'btn btn-ghost btn-small', mine ? `Jouw review: ${starsText(mine.rating)} — aanpassen` : '⭐ Review schrijven');
      const slot = el('div');
      toggle.addEventListener('click', () => {
        if (slot.firstChild) { slot.textContent = ''; return; }
        slot.appendChild(reviewForm(prod, mine || null, () => render()));
      });
      reviewBox.append(toggle, slot);
      row.appendChild(reviewBox);
    }

    list.appendChild(row);
  });
}

function cartItems() {
  return state.cart.map((id) => state.products.find((p) => p.id === id)).filter((p) => p && !isOwned(p.id));
}

function quoteKeyFor(items) {
  return `${items.map((p) => p.id).sort().join(',')}|${state.discountCode}`;
}

let quoteToken = 0;
async function fetchQuote(items) {
  const key = quoteKeyFor(items);
  if (state.quote && state.quoteKey === key) return;
  const token = ++quoteToken;
  try {
    const { pricing } = await api('POST', '/store/quote', { guildId: state.guildId, productIds: items.map((p) => p.id), code: state.discountCode });
    if (token !== quoteToken) return;
    state.quote = pricing;
    state.quoteKey = key;
  } catch {
    if (token === quoteToken) { state.quote = null; state.quoteKey = ''; }
    return;
  }
  if (currentRoute().view === 'cart') renderCart(true);
}

function renderCart(skipQuote) {
  const items = cartItems();

  const list = $('cartList');
  list.textContent = '';
  $('cartEmpty').classList.toggle('hidden', items.length > 0);
  $('cartFooter').classList.toggle('hidden', items.length === 0);
  if (items.length === 0) return;

  const q = state.quote && state.quoteKey === quoteKeyFor(items) ? state.quote : null;

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
    const line = q ? q.items.find((i) => i.id === p.id) : null;
    if (line && line.finalCents !== line.originalCents) {
      right.appendChild(el('span', 'price-old', formatPrice(line.originalCents, p.currency)));
      right.appendChild(el('span', 'product-price', formatPrice(line.finalCents, p.currency)));
    } else {
      right.appendChild(el('span', 'product-price', formatPrice(p.priceCents, p.currency)));
    }
    const rm = el('button', 'btn btn-ghost btn-small', 'Verwijder');
    rm.addEventListener('click', () => toggleCart(p.id));
    right.appendChild(rm);
    row.appendChild(right);
    list.appendChild(row);
  });

  const mixed = new Set(items.map((p) => p.currency)).size > 1;
  const currency = items[0].currency;
  const plainTotal = items.reduce((s, p) => s + p.priceCents, 0);
  const total = q && !mixed ? q.totalCents : plainTotal;

  // Samenvatting met kortingen
  const sum = $('cartSummary');
  sum.textContent = '';
  const addLine = (label, value, cls) => {
    const row = el('div', `cart-summary-row${cls ? ` ${cls}` : ''}`);
    row.appendChild(el('span', '', label));
    row.appendChild(el('span', '', value));
    sum.appendChild(row);
  };
  if (q && !mixed && (q.bundleDiscountCents > 0 || q.codeDiscountCents > 0)) {
    addLine('Subtotaal', formatPrice(q.subtotalCents, currency));
    if (q.bundleDiscountCents > 0) addLine(`Bundelkorting (${q.bundles.map((b) => b.name).join(', ')})`, `−${formatPrice(q.bundleDiscountCents, currency)}`, 'discount');
    if (q.codeDiscountCents > 0 && q.code) addLine(`Kortingscode ${q.code.code}`, `−${formatPrice(q.codeDiscountCents, currency)}`, 'discount');
  }

  // Melding bij de code
  const msg = $('codeMsg');
  msg.className = 'code-msg';
  msg.textContent = '';
  if (state.discountCode && q) {
    if (q.codeError) { msg.textContent = q.codeError; msg.classList.add('error'); }
    else if (q.code) { msg.textContent = `Code ${q.code.code} toegepast ✓`; msg.classList.add('ok'); }
  }

  if (mixed) {
    $('cartTotal').textContent = 'Verschillende valuta — reken ze apart af';
  } else {
    $('cartTotal').textContent = formatPrice(total, currency);
  }
  $('checkoutBtn').textContent = items.every((p) => p.priceCents === 0) || (q && !mixed && q.totalCents === 0) ? 'Gratis ophalen' : 'Afrekenen';
  $('checkoutBtn').disabled = mixed;
  $('checkoutBtn').classList.toggle('hidden', !state.user);
  $('checkoutLogin').classList.toggle('hidden', !!state.user);

  if (!skipQuote && !mixed) fetchQuote(items);
}

// ---------- routing ----------
function currentRoute() {
  const h = location.hash || '#/';
  if (h.startsWith('#/product/')) return { view: 'product', id: decodeURIComponent(h.slice('#/product/'.length)) };
  if (h === '#/shop') return { view: 'shop' };
  if (h === '#/cart') return { view: 'cart' };
  if (h === '#/reviews') return { view: 'reviews' };
  if (h === '#/account') return { view: 'account' };
  return { view: 'home' };
}

function render() {
  const route = currentRoute();
  ['home', 'shop', 'product', 'cart', 'account', 'reviews'].forEach((v) => $(`view-${v}`).classList.toggle('hidden', v !== route.view));
  document.querySelectorAll('.topnav a[data-view]').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === (route.view === 'product' ? 'shop' : route.view));
  });

  if (route.view === 'home') renderHome();
  if (route.view === 'shop') renderShop();
  if (route.view === 'product') renderProduct(route.id);
  if (route.view === 'cart') renderCart();
  if (route.view === 'account') renderAccount();
  if (route.view === 'reviews') renderReviewsPage();
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ---------- events ----------
$('sortSelect').addEventListener('change', (e) => { state.filter.sort = e.target.value; renderShop(); });
$('searchInput').addEventListener('input', (e) => { state.filter.search = e.target.value; renderShop(); });
$('priceRange').addEventListener('input', (e) => { state.filter.maxPrice = Number(e.target.value); renderShop(); });

$('codeApply').addEventListener('click', () => {
  state.discountCode = $('codeInput').value.trim().toUpperCase();
  state.quoteKey = '';
  renderCart();
});
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('codeApply').click(); });

$('checkoutBtn').addEventListener('click', async () => {
  const btn = $('checkoutBtn');
  const ids = state.cart.filter((id) => state.products.some((p) => p.id === id) && !isOwned(id));
  btn.disabled = true;
  btn.textContent = 'Even geduld...';
  try {
    const code = state.quote && state.quote.code ? state.discountCode : undefined;
    const result = await api('POST', '/store/checkout', { productIds: ids, code });
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    // Alleen gratis producten: direct afgehandeld, bestand komt per DM.
    state.cart = state.cart.filter((id) => !ids.includes(id));
    state.discountCode = '';
    state.quote = null;
    state.quoteKey = '';
    $('codeInput').value = '';
    saveCart();
    try { ({ productIds: state.ownedIds } = await api('GET', `/store/my-purchases/${state.guildId}`)); } catch { /* laat staan */ }
    state.orders = null; // volgende bezoek aan "Mijn aankopen" opnieuw ophalen
    showBanner('Gelukt! Je bestand is onderweg per privébericht (DM) van de Aurex-bot. Laat daarna gerust een review achter via Mijn aankopen. Kom je niets binnen, controleer dan of je DM\'s van serverleden hebt toegestaan — je kunt het bestand ook hier downloaden.', 'success');
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
    showBanner('Betaling gelukt! Het kan een paar seconden duren voordat "Al gekocht" verschijnt. Tevreden? Laat een review achter via Mijn aankopen.', 'success');
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

  try { ({ bundles: state.bundles } = await api('GET', `/store/bundles/${state.guildId}`)); } catch { state.bundles = []; }

  if (state.user) {
    try { ({ productIds: state.ownedIds } = await api('GET', `/store/my-purchases/${state.guildId}`)); } catch { state.ownedIds = []; }
  }

  // Verdwenen/inactieve producten uit een oude winkelwagen halen.
  state.cart = state.cart.filter((id) => state.products.some((p) => p.id === id));
  saveCart();
  render();
})();
