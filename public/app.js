// ---------------------------------------------------------------------------
// Boot: fetch public config, init Supabase client, then wire up the page.
// ---------------------------------------------------------------------------
let supabase;
let currentUser = null;
let PRODUCTS = [];
let cart = JSON.parse(localStorage.getItem('lootforge_cart') || '[]');

async function boot() {
  const config = await fetch('/api/config').then(r => r.json());
  supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  const { data } = await supabase.auth.getSession();
  currentUser = data.session ? data.session.user : null;
  updateAuthUI();

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    updateAuthUI();
    if (currentUser) loadPurchases();
  });

  await loadProducts();
  renderReviews();
  renderStatus();
  renderCart();
  handlePaymentRedirect();
  if (currentUser) loadPurchases();
}

// ---------------------------------------------------------------------------
// Ticker
// ---------------------------------------------------------------------------
const tickerItems = [
  { icon:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.35-9.5-8.5C.5 9 2 5 6 5c2 0 3.5 1 4 2.5C10.5 6 12 5 14 5c4 0 5.5 4 3.5 7.5C19 16.65 12 21 12 21z"/></svg>', color:'var(--pink)', text:'OVER 2,500 SATISFIED CUSTOMERS' },
  { icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l4 6-10 12L2 9z"/></svg>', color:'var(--teal)', text:'5% OFF AT CHECKOUT — CODE "LOOT5"' },
  { icon:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8L5.7 21l1.7-7-5.4-4.7 7.1-.6z"/></svg>', color:'var(--gold)', text:'5 STAR RATING' },
  { icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>', color:'var(--text-primary)', text:'OFFICIAL RESELLER' },
  { icon:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 3 14h7l-1 8 11-12h-7l1-8z"/></svg>', color:'var(--accent)', text:'INSTANT DELIVERY' },
  { icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11v3a1 1 0 0 0 1 1h2v-6H4a1 1 0 0 0-1 1zM21 11v3a1 1 0 0 1-1 1h-2v-6h2a1 1 0 0 1 1 1z"/><path d="M5 11a7 7 0 0 1 14 0M19 16v1a3 3 0 0 1-3 3h-3"/></svg>', color:'var(--green)', text:'24/7 SUPPORT' },
  { icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 3"/></svg>', color:'var(--blue)', text:'SECURE CHECKOUT' },
  { icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z"/></svg>', color:'var(--gold)', text:'100% SAFE AND RELIABLE' },
];
const tickerHTML = tickerItems.map(i => `<div class="ticker-item" style="color:${i.color}">${i.icon}${i.text}</div>`).join('');
document.getElementById('ticker').innerHTML = tickerHTML + tickerHTML;

const onlineEl = document.getElementById('online-count');
let online = 52;
setInterval(() => {
  online += Math.random() > 0.5 ? 1 : -1;
  online = Math.max(38, Math.min(74, online));
  onlineEl.textContent = online;
}, 3500);

// ---------------------------------------------------------------------------
// Page navigation
// ---------------------------------------------------------------------------
function showPage(e, name) {
  if (e) e.preventDefault();
  if (name === 'account' && !currentUser) { openAuthModal('signin'); return; }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('#nav-links > a[data-page]').forEach(a => a.classList.remove('active'));
  const link = document.querySelector('#nav-links > a[data-page="' + name + '"]');
  if (link) link.classList.add('active');
  closeMore();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMore(e) { e.preventDefault(); e.stopPropagation(); document.getElementById('more-menu').classList.toggle('open'); }
function closeMore(e) { if (e) e.preventDefault(); document.getElementById('more-menu').classList.remove('open'); }
document.addEventListener('click', () => closeMore());

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
let authMode = 'signin';

function openAuthModal(mode) {
  authMode = mode;
  switchAuthMode(mode);
  document.getElementById('auth-overlay').classList.add('open');
}
function closeAuthModal() {
  document.getElementById('auth-overlay').classList.remove('open');
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
}
function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('auth-error').textContent = '';
  if (mode === 'signin') {
    document.getElementById('auth-title').textContent = 'Welcome back';
    document.getElementById('auth-sub').textContent = 'Sign in to your account.';
    document.getElementById('auth-submit-btn').textContent = 'Sign In';
    document.getElementById('auth-footer').innerHTML = `Don't have an account? <a onclick="switchAuthMode('signup')">Sign up</a>`;
  } else {
    document.getElementById('auth-title').textContent = 'Create your account';
    document.getElementById('auth-sub').textContent = 'Takes about ten seconds.';
    document.getElementById('auth-submit-btn').textContent = 'Sign Up';
    document.getElementById('auth-footer').innerHTML = `Already have an account? <a onclick="switchAuthMode('signin')">Sign in</a>`;
  }
}

async function submitAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');
  errorEl.textContent = '';
  if (!email || !password) { errorEl.textContent = 'Email and password are required.'; return; }

  const fn = authMode === 'signin' ? 'signInWithPassword' : 'signUp';
  const { data, error } = await supabase.auth[fn]({ email, password });

  if (error) { errorEl.textContent = error.message; return; }

  if (authMode === 'signup' && !data.session) {
    errorEl.style.color = 'var(--green)';
    errorEl.textContent = 'Check your email to confirm your account, then sign in.';
    return;
  }
  closeAuthModal();
}

async function signOut() {
  await supabase.auth.signOut();
  showPage(null, 'home');
}

function updateAuthUI() {
  const loggedOut = document.getElementById('logged-out-controls');
  const loggedIn = document.getElementById('logged-in-controls');
  const accountLink = document.getElementById('account-nav-link');
  if (currentUser) {
    loggedOut.style.display = 'none';
    loggedIn.style.display = 'flex';
    accountLink.style.display = 'inline-block';
    document.getElementById('user-email-label').textContent = currentUser.email;
  } else {
    loggedOut.style.display = 'block';
    loggedIn.style.display = 'none';
    accountLink.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// Products / Store
// ---------------------------------------------------------------------------
async function loadProducts() {
  PRODUCTS = await fetch('/api/products').then(r => r.json());
  document.getElementById('product-grid').innerHTML = PRODUCTS.map(p => `
    <div class="product-card">
      <span class="product-tag" style="background:${p.color}22; color:${p.color}">${p.tag}</span>
      <h3>${p.name}</h3>
      <div class="price">$${(p.price / 100).toFixed(2)} <span>${p.period === 'one-time' ? 'one-time' : '/ ' + p.period}</span></div>
      <div class="desc">${p.description}</div>
      <button class="btn-add" onclick="addToCart('${p.id}', this)">Add to Cart</button>
    </div>
  `).join('');
}

function addToCart(productId, btn) {
  const existing = cart.find(i => i.productId === productId);
  if (existing) existing.qty += 1;
  else cart.push({ productId, qty: 1 });
  localStorage.setItem('lootforge_cart', JSON.stringify(cart));
  renderCart();
  if (btn) {
    const original = btn.textContent;
    btn.textContent = 'Added ✓';
    btn.classList.add('added');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('added'); }, 1400);
  }
}

// ---------------------------------------------------------------------------
// Cart drawer
// ---------------------------------------------------------------------------
function openCart() { renderCart(); document.getElementById('drawer').classList.add('open'); document.getElementById('drawer-overlay').classList.add('open'); }
function closeCart() { document.getElementById('drawer').classList.remove('open'); document.getElementById('drawer-overlay').classList.remove('open'); }

function renderCart() {
  const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
  const countEl = document.getElementById('cart-count');
  countEl.textContent = totalQty;
  countEl.style.display = totalQty > 0 ? 'flex' : 'none';

  const itemsEl = document.getElementById('drawer-items');
  if (cart.length === 0) {
    itemsEl.innerHTML = `<div class="empty-state">Your cart is empty.</div>`;
  } else {
    itemsEl.innerHTML = cart.map(item => {
      const product = PRODUCTS.find(p => p.id === item.productId);
      if (!product) return '';
      return `
        <div class="cart-item">
          <div class="info">
            <div class="name">${product.name}</div>
            <div class="price">$${(product.price / 100).toFixed(2)} each</div>
          </div>
          <div class="qty-controls">
            <button onclick="changeQty('${item.productId}', -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="changeQty('${item.productId}', 1)">+</button>
          </div>
        </div>
      `;
    }).join('');
  }

  const total = cart.reduce((sum, item) => {
    const product = PRODUCTS.find(p => p.id === item.productId);
    return sum + (product ? product.price * item.qty : 0);
  }, 0);
  document.getElementById('cart-total').textContent = `$${(total / 100).toFixed(2)}`;
}

function changeQty(productId, delta) {
  const item = cart.find(i => i.productId === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.productId !== productId);
  localStorage.setItem('lootforge_cart', JSON.stringify(cart));
  renderCart();
}

async function checkout() {
  if (cart.length === 0) return;
  if (!currentUser) { closeCart(); openAuthModal('signin'); return; }

  const { data } = await supabase.auth.getSession();
  const token = data.session ? data.session.access_token : null;

  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: cart })
  });
  const body = await res.json();
  if (!res.ok) { alert(body.error || 'Checkout failed.'); return; }

  cart = [];
  localStorage.setItem('lootforge_cart', JSON.stringify(cart));
  window.location.href = body.url; // Stripe-hosted checkout page
}

function handlePaymentRedirect() {
  const params = new URLSearchParams(window.location.search);
  const bannerEl = document.getElementById('payment-banner');
  if (params.get('success')) {
    bannerEl.innerHTML = `<div class="banner success">Payment received — thanks! Check My Account for your order.</div>`;
  } else if (params.get('canceled')) {
    bannerEl.innerHTML = `<div class="banner cancel">Checkout was canceled. Your cart has been kept.</div>`;
  }
}

// ---------------------------------------------------------------------------
// Account / purchase history (read directly from Supabase — protected by RLS)
// ---------------------------------------------------------------------------
async function loadPurchases() {
  const { data, error } = await supabase
    .from('purchases')
    .select('*')
    .order('created_at', { ascending: false });

  const el = document.getElementById('purchases-list');
  if (error) { el.innerHTML = `<div class="empty-state">Could not load orders.</div>`; return; }
  if (!data || data.length === 0) { el.innerHTML = `<div class="empty-state">No orders yet — visit the Store to get started.</div>`; return; }

  el.innerHTML = data.map(p => `
    <div class="purchase-row">
      <span>${p.product_name}</span>
      <span style="display:flex; align-items:center; gap:14px;">
        <span>$${(p.amount_cents / 100).toFixed(2)}</span>
        <span class="status-tag ${p.status}">${p.status.toUpperCase()}</span>
      </span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// Reviews / Status (static demo content — replace with real data anytime)
// ---------------------------------------------------------------------------
function renderReviews() {
  const reviews = [
    { name:'Jordan K.', initial:'J', color:'#ff3b3b', stars:5, when:'3 days ago', text:'Setup took two minutes and everything just worked. Support answered within the hour when I had a question.' },
    { name:'Priya S.', initial:'P', color:'#5b9eff', stars:5, when:'1 week ago', text:'Been using the Pro Plan for two months now. Updates roll out fast whenever something changes.' },
    { name:'Marcus T.', initial:'M', color:'#34d399', stars:4, when:'2 weeks ago', text:'Solid value for the Starter Plan. Would like a few more customization options, otherwise great.' },
    { name:'Aiko N.', initial:'A', color:'#f0b429', stars:5, when:'3 weeks ago', text:'Delivery really is instant — had access before I even closed the checkout tab.' },
    { name:'Diego R.', initial:'D', color:'#2dd4bf', stars:5, when:'1 month ago', text:'Switched from a competitor and the difference in support response time is night and day.' },
    { name:'Leah W.', initial:'L', color:'#ff6b9d', stars:4, when:'1 month ago', text:'Clean dashboard, easy to manage my subscription. Renewal reminders are a nice touch.' },
  ];
  document.getElementById('review-grid').innerHTML = reviews.map(r => `
    <div class="review-card">
      <span class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
      <p>${r.text}</p>
      <div class="review-meta">
        <div class="review-avatar" style="background:${r.color}">${r.initial}</div>
        <div><div class="name">${r.name}</div><div class="when">${r.when}</div></div>
      </div>
    </div>
  `).join('');
}

function renderStatus() {
  const services = ['Checkout & Payments','License Delivery','Account Dashboard','Customer Support','API & Integrations','Update Server'];
  document.getElementById('status-list').innerHTML = services.map(s => `
    <div class="status-row"><span>${s}</span><span class="ok"><span class="dot"></span> Operational</span></div>
  `).join('');
}

boot();
