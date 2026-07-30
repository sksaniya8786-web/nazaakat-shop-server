/* ===================================================================
   Nazaakat by Saniya — shared account / bag / wishlist module (v2)
   Talks to the local Node.js + SQLite server instead of localStorage.
   Include this file on every page (before the page's own <script>):
     <script src="nazaakat-shop.js"></script>
   Requires the server (server.js) to be running — open the site via
   http://localhost:3000, not by double-clicking the HTML files.
   =================================================================== */
(function () {

  /* ---------------- local cache (kept in sync with the server) ---------------- */
  let _user = null;
  let _cart = [];
  let _wishlist = [];

  async function api(path, options) {
    const res = await fetch(path, Object.assign({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }, options));
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    return data;
  }

  async function refreshMe() {
    const data = await api('/api/me');
    _user = data.user || null;
    return _user;
  }
  async function refreshCart() {
    if (!_user) { _cart = []; return _cart; }
    const data = await api('/api/cart');
    _cart = data.items || [];
    renderBadges();
    return _cart;
  }
  async function refreshWishlist() {
    if (!_user) { _wishlist = []; return _wishlist; }
    const data = await api('/api/wishlist');
    _wishlist = data.items || [];
    renderBadges();
    return _wishlist;
  }

  /* Resolves once the initial session/cart/wishlist state has loaded.
     Page scripts can `await NazaakatShop.ready` before relying on
     isWishlisted()/getCart() returning real data. */
  const ready = (async () => {
    await refreshMe();
    if (_user) { await Promise.all([refreshCart(), refreshWishlist()]); }
  })();

  function slug(s) {
    return String(s).toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  function formatINR(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function currentUser() { return _user; }
  function getCart() { return _cart; }
  function getWishlist() { return _wishlist; }
  function isWishlisted(id) { return _wishlist.some(i => i.product_id === id); }

  /* ---------------- auth ---------------- */
  async function register({ name, email, phone, password }) {
    const data = await api('/api/register', { method: 'POST', body: JSON.stringify({ name, email, phone, password }) });
    if (data.ok) { _user = data.user; await Promise.all([refreshCart(), refreshWishlist()]); }
    return data;
  }
  async function login({ email, password }) {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data.ok) { _user = data.user; await Promise.all([refreshCart(), refreshWishlist()]); }
    return data;
  }
  async function logout() {
    await api('/api/logout', { method: 'POST' });
    _user = null; _cart = []; _wishlist = [];
    location.href = 'Nazaakat.html';
  }
  async function resetPassword({ email, phone, newPassword }) {
    return api('/api/forgot-password', { method: 'POST', body: JSON.stringify({ email, phone, newPassword }) });
  }

  const REDIRECT_KEY = 'naz_redirect_v1'; // small localStorage flag is fine, it's not sensitive data

  async function requireLogin(message) {
    await ready;
    if (currentUser()) return true;
    const goLogin = confirm((message || 'Please sign in to continue.') + '\n\nGo to the login page now?');
    if (goLogin) {
      localStorage.setItem(REDIRECT_KEY, location.pathname.split('/').pop() || 'Nazaakat.html');
      location.href = 'login.html';
    }
    return false;
  }
  function consumeRedirect() {
    const r = localStorage.getItem(REDIRECT_KEY);
    localStorage.removeItem(REDIRECT_KEY);
    return r;
  }

  /* ---------------- cart ---------------- */
  async function addToCart(item) {
    if (!(await requireLogin('Please sign in or create a free account to add items to your bag.'))) return false;
    const data = await api('/api/cart', { method: 'POST', body: JSON.stringify(item) });
    if (data.ok) { _cart = data.items; renderBadges(); openCart(); return true; }
    if (data.error) alert(data.error);
    return false;
  }
  async function removeFromCart(id) {
    const data = await api('/api/cart/' + encodeURIComponent(id), { method: 'DELETE' });
    if (data.ok) { _cart = data.items; renderBadges(); }
    renderCartDrawer();
  }
  async function setCartQty(id, qty) {
    const data = await api('/api/cart/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ qty }) });
    if (data.ok) { _cart = data.items; renderBadges(); }
    renderCartDrawer();
  }

  /* ---------------- wishlist ---------------- */
  async function toggleWishlist(item) {
    if (!(await requireLogin('Please sign in or create a free account to save items to your wishlist.'))) return false;
    const data = await api('/api/wishlist/toggle', { method: 'POST', body: JSON.stringify(item) });
    if (data.ok) {
      _wishlist = data.items; renderBadges();
      document.querySelectorAll('[data-wish-id="' + item.productId + '"]').forEach(btn => btn.classList.toggle('active', data.added));
      return data.added;
    }
    return false;
  }
  async function moveWishToCart(id) {
    const it = _wishlist.find(i => i.product_id === id);
    if (!it) return;
    const added = await addToCart({ productId: it.product_id, id: it.product_id, name: it.name, image: it.image, price: it.price, category: it.category, qty: 1 });
    if (added) {
      const data = await api('/api/wishlist/' + encodeURIComponent(id), { method: 'DELETE' });
      if (data.ok) { _wishlist = data.items; renderBadges(); }
      renderWishlistDrawer();
    }
  }

  /* ---------------- checkout / orders ---------------- */
  async function checkout({ paymentMethod, address } = {}) {
    const data = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ paymentMethod, address }) });
    if (data.ok) { _cart = []; renderBadges(); }
    return data;
  }
  async function getOrders() {
    if (!(await requireLogin('Please sign in to view your orders.'))) return [];
    const data = await api('/api/orders');
    return data.orders || [];
  }

  /* ---------------- drawer UI (injected once per page) ---------------- */
  let uiReady = false;
  function ensureUI() {
    if (uiReady) return;
    uiReady = true;

    const style = document.createElement('style');
    style.textContent = `
      .naz-icon-wrap{position:relative;}
      .naz-badge{position:absolute;top:-6px;right:-8px;background:#B08D4F;color:#FBF8F2;font-family:'Jost',sans-serif;font-size:.62rem;line-height:1;min-width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0 3px;}
      .naz-drawer-overlay{position:fixed;inset:0;background:rgba(42,36,29,.5);backdrop-filter:blur(3px);z-index:900;display:none;}
      .naz-drawer-overlay.open{display:block;}
      .naz-drawer{position:fixed;top:0;right:0;height:100%;width:400px;max-width:92vw;background:#FBF8F2;z-index:901;transform:translateX(100%);transition:transform .35s ease;display:flex;flex-direction:column;box-shadow:-14px 0 40px rgba(0,0,0,.18);}
      .naz-drawer.open{transform:translateX(0);}
      .naz-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:1.4em 1.6em;border-bottom:1px solid rgba(42,36,29,.14);}
      .naz-drawer-head h3{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:1.4rem;color:#2A241D;margin:0;}
      .naz-drawer-close{background:none;border:none;font-size:1.4rem;cursor:pointer;color:#2A241D;line-height:1;}
      .naz-drawer-body{flex:1;overflow-y:auto;padding:1.2em 1.6em;}
      .naz-drawer-item{display:flex;gap:.9em;padding:1em 0;border-bottom:1px solid rgba(42,36,29,.1);}
      .naz-drawer-item img{width:64px;height:78px;object-fit:cover;border-radius:6px;flex-shrink:0;background:#EBE0CC;}
      .naz-drawer-item-info{flex:1;}
      .naz-drawer-item-info h4{font-family:'Cormorant Garamond',serif;font-size:1.05rem;font-weight:600;color:#2A241D;margin:0;}
      .naz-drawer-item-info .meta{font-size:.72rem;color:#8B7059;text-transform:uppercase;letter-spacing:.08em;margin:.25em 0 .5em;font-family:'Jost',sans-serif;}
      .naz-drawer-item-info .price{font-family:'Cormorant Garamond',serif;color:#535731;font-size:1rem;}
      .naz-qty{display:flex;align-items:center;gap:.6em;margin-top:.5em;font-family:'Jost',sans-serif;}
      .naz-qty button{width:22px;height:22px;border:1px solid rgba(42,36,29,.25);background:none;cursor:pointer;font-size:.8rem;border-radius:3px;}
      .naz-remove, .naz-move{background:none;border:none;color:#8B7059;text-decoration:underline;font-size:.72rem;cursor:pointer;margin-top:.5em;margin-right:1em;font-family:'Jost',sans-serif;padding:0;}
      .naz-drawer-empty{text-align:center;color:#8B7059;padding:3em 1em;font-size:.9rem;font-family:'Jost',sans-serif;}
      .naz-drawer-footer{padding:1.3em 1.6em 1.6em;border-top:1px solid rgba(42,36,29,.14);}
      .naz-drawer-footer .subtotal{display:flex;justify-content:space-between;font-family:'Cormorant Garamond',serif;font-size:1.2rem;margin-bottom:1em;color:#2A241D;}
      .naz-checkout-btn{width:100%;padding:1em;background:#2A241D;color:#F5EEE2;border:none;font-size:.78rem;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;font-family:'Jost',sans-serif;}
      .naz-checkout-btn:hover{background:#535731;}
      .naz-checkout-btn:disabled{opacity:.6;cursor:not-allowed;}
      .naz-account-menu{position:absolute;top:130%;right:0;background:#FBF8F2;border:1px solid rgba(42,36,29,.14);border-radius:8px;min-width:190px;box-shadow:0 18px 34px -14px rgba(42,36,29,.3);padding:.6em;z-index:120;display:none;}
      .naz-account-menu.open{display:block;}
      .naz-account-menu .who{font-family:'Cormorant Garamond',serif;font-size:1.05rem;padding:.5em .7em;color:#2A241D;border-bottom:1px solid rgba(42,36,29,.1);margin-bottom:.4em;}
      .naz-account-menu button, .naz-account-menu a{display:block;width:100%;text-align:left;background:none;border:none;padding:.55em .7em;font-family:'Jost',sans-serif;font-size:.82rem;color:#2A241D;cursor:pointer;border-radius:5px;}
      .naz-account-menu button:hover, .naz-account-menu a:hover{background:#EBE0CC;}
      .naz-wish-heart{position:absolute;top:.7em;right:.7em;width:34px;height:34px;border-radius:50%;background:rgba(251,248,242,.92);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:5;transition:.25s;}
      .naz-wish-heart:hover{background:#FBF8F2;}
      .naz-wish-heart svg{width:17px;height:17px;stroke:#2A241D;fill:none;stroke-width:1.6;}
      .naz-wish-heart.active svg{fill:#C89B92;stroke:#C89B92;}
      .naz-order-status{display:inline-block;padding:.25em .7em;border-radius:20px;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;font-family:'Jost',sans-serif;}
      .naz-order-status.pending{background:#EBE0CC;color:#8B7059;}
      .naz-order-status.accepted{background:#D9E0C6;color:#535731;}
      .naz-order-status.delivered{background:#2A241D;color:#F5EEE2;}
      .naz-order-block{padding:1.1em 0;border-bottom:1px solid rgba(42,36,29,.1);}
      .naz-order-block .order-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.6em;font-family:'Jost',sans-serif;font-size:.78rem;color:#8B7059;}
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'naz-drawer-overlay';
    overlay.id = 'nazDrawerOverlay';

    const cartDrawer = document.createElement('div');
    cartDrawer.className = 'naz-drawer';
    cartDrawer.id = 'nazCartDrawer';
    cartDrawer.innerHTML =
      '<div class="naz-drawer-head"><h3>Your Bag</h3><button class="naz-drawer-close" data-close>&times;</button></div>' +
      '<div class="naz-drawer-body" id="nazCartBody"></div>' +
      '<div class="naz-drawer-footer" id="nazCartFooter"></div>';

    const wishDrawer = document.createElement('div');
    wishDrawer.className = 'naz-drawer';
    wishDrawer.id = 'nazWishDrawer';
    wishDrawer.innerHTML =
      '<div class="naz-drawer-head"><h3>Your Wishlist</h3><button class="naz-drawer-close" data-close>&times;</button></div>' +
      '<div class="naz-drawer-body" id="nazWishBody"></div>';

    const ordersDrawer = document.createElement('div');
    ordersDrawer.className = 'naz-drawer';
    ordersDrawer.id = 'nazOrdersDrawer';
    ordersDrawer.innerHTML =
      '<div class="naz-drawer-head"><h3>My Orders</h3><button class="naz-drawer-close" data-close>&times;</button></div>' +
      '<div class="naz-drawer-body" id="nazOrdersBody"></div>';

    document.body.appendChild(overlay);
    document.body.appendChild(cartDrawer);
    document.body.appendChild(wishDrawer);
    document.body.appendChild(ordersDrawer);

    overlay.addEventListener('click', closeDrawers);
    document.querySelectorAll('.naz-drawer-close').forEach(b => b.addEventListener('click', closeDrawers));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawers(); });
  }

  function closeDrawers() {
    ['nazDrawerOverlay', 'nazCartDrawer', 'nazWishDrawer', 'nazOrdersDrawer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('open');
    });
    document.body.style.overflow = '';
  }

  async function openCart() {
    ensureUI();
    if (!(await requireLogin('Please sign in to view your bag.'))) return;
    renderCartDrawer();
    document.getElementById('nazDrawerOverlay').classList.add('open');
    document.getElementById('nazCartDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  async function openWishlist() {
    ensureUI();
    if (!(await requireLogin('Please sign in to view your wishlist.'))) return;
    renderWishlistDrawer();
    document.getElementById('nazDrawerOverlay').classList.add('open');
    document.getElementById('nazWishDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  async function openOrders() {
    ensureUI();
    const orders = await getOrders();
    if (!currentUser()) return;
    renderOrdersDrawer(orders);
    document.getElementById('nazDrawerOverlay').classList.add('open');
    document.getElementById('nazOrdersDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function renderCartDrawer() {
    const body = document.getElementById('nazCartBody');
    const footer = document.getElementById('nazCartFooter');
    if (!body) return;
    const items = getCart();
    if (items.length === 0) {
      body.innerHTML = '<div class="naz-drawer-empty">Your bag is empty.<br>Start adding pieces you love.</div>';
      footer.innerHTML = '';
      return;
    }
    body.innerHTML = items.map(it => `
      <div class="naz-drawer-item">
        <img src="${it.image}" alt="${it.name}">
        <div class="naz-drawer-item-info">
          <h4>${it.name}</h4>
          <div class="meta">${[it.color, it.size].filter(Boolean).join(' · ')}</div>
          <div class="price">${formatINR(it.price)}</div>
          <div class="naz-qty">
            <button data-qty-dec="${it.product_id}">&minus;</button>
            <span>${it.qty}</span>
            <button data-qty-inc="${it.product_id}">+</button>
          </div>
          <button class="naz-remove" data-remove="${it.product_id}">Remove</button>
        </div>
      </div>`).join('');

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    footer.innerHTML = `
      <div class="subtotal"><span>Subtotal</span><span>${formatINR(subtotal)}</span></div>
      <button class="naz-checkout-btn" id="nazCheckoutBtn">Proceed to Checkout</button>`;

    body.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => removeFromCart(b.dataset.remove)));
    body.querySelectorAll('[data-qty-inc]').forEach(b => b.addEventListener('click', () => {
      const it = getCart().find(i => i.product_id === b.dataset.qtyInc); if (it) setCartQty(it.product_id, it.qty + 1);
    }));
    body.querySelectorAll('[data-qty-dec]').forEach(b => b.addEventListener('click', () => {
      const it = getCart().find(i => i.product_id === b.dataset.qtyDec); if (it) setCartQty(it.product_id, it.qty - 1);
    }));
    const checkoutBtn = document.getElementById('nazCheckoutBtn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', () => {
      location.href = 'checkout.html';
    });
  }

  function renderWishlistDrawer() {
    const body = document.getElementById('nazWishBody');
    if (!body) return;
    const items = getWishlist();
    if (items.length === 0) {
      body.innerHTML = '<div class="naz-drawer-empty">Your wishlist is empty.<br>Tap the heart on any piece to save it here.</div>';
      return;
    }
    body.innerHTML = items.map(it => `
      <div class="naz-drawer-item">
        <img src="${it.image}" alt="${it.name}">
        <div class="naz-drawer-item-info">
          <h4>${it.name}</h4>
          <div class="price">${formatINR(it.price)}</div>
          <div>
            <button class="naz-move" data-move="${it.product_id}">Move to Bag</button>
            <button class="naz-remove" data-remove-wish="${it.product_id}">Remove</button>
          </div>
        </div>
      </div>`).join('');
    body.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => moveWishToCart(b.dataset.move)));
    body.querySelectorAll('[data-remove-wish]').forEach(b => b.addEventListener('click', async () => {
      const data = await api('/api/wishlist/' + encodeURIComponent(b.dataset.removeWish), { method: 'DELETE' });
      if (data.ok) { _wishlist = data.items; renderBadges(); }
      renderWishlistDrawer();
    }));
  }

  function renderOrdersDrawer(orders) {
    const body = document.getElementById('nazOrdersBody');
    if (!body) return;
    if (!orders || orders.length === 0) {
      body.innerHTML = '<div class="naz-drawer-empty">You haven\'t placed any orders yet.</div>';
      return;
    }
    body.innerHTML = orders.map(o => `
      <div class="naz-order-block">
        <div class="order-head">
          <span>Order #${o.id} · ${new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span class="naz-order-status ${o.status}">${o.status}</span>
        </div>
        ${o.items.map(it => `
          <div class="naz-drawer-item">
            <img src="${it.image}" alt="${it.name}">
            <div class="naz-drawer-item-info">
              <h4>${it.name}</h4>
              <div class="meta">${[it.color, it.size].filter(Boolean).join(' · ')} · Qty ${it.qty}</div>
              <div class="price">${formatINR(it.price)}</div>
            </div>
          </div>`).join('')}
        <div style="text-align:right;font-family:'Cormorant Garamond',serif;color:#2A241D;margin-top:.4em;">Total: ${formatINR(o.subtotal)}</div>
      </div>`).join('');
  }

  function renderBadges() {
    const cartCount = getCart().reduce((s, i) => s + i.qty, 0);
    const wishCount = getWishlist().length;
    document.querySelectorAll('.naz-cart-count').forEach(el => { el.textContent = cartCount; el.style.display = cartCount ? 'flex' : 'none'; });
    document.querySelectorAll('.naz-wish-count').forEach(el => { el.textContent = wishCount; el.style.display = wishCount ? 'flex' : 'none'; });
    document.querySelectorAll('.naz-wish-heart[data-wish-id]').forEach(btn => {
      btn.classList.toggle('active', isWishlisted(btn.dataset.wishId));
    });
  }

  function renderAccountUI() {
    document.querySelectorAll('.naz-account-btn').forEach(container => {
      const u = currentUser();
      let menu = container.querySelector('.naz-account-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.className = 'naz-account-menu';
        container.appendChild(menu);
      }
      if (u) {
        menu.innerHTML = `<div class="who">Hi, ${u.name.split(' ')[0]}</div><button data-orders>My Orders</button><button data-logout>Sign Out</button>`;
        menu.querySelector('[data-orders]').addEventListener('click', (e) => { e.stopPropagation(); menu.classList.remove('open'); openOrders(); });
        menu.querySelector('[data-logout]').addEventListener('click', (e) => { e.stopPropagation(); logout(); });
      } else {
        menu.innerHTML = '';
      }
    });
  }

  function wireNav() {
    ensureUI();

    document.querySelectorAll('.naz-account-btn').forEach(btn => {
      btn.classList.add('naz-icon-wrap');
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await ready;
        if (currentUser()) {
          const menu = btn.querySelector('.naz-account-menu');
          document.querySelectorAll('.naz-account-menu').forEach(m => { if (m !== menu) m.classList.remove('open'); });
          if (menu) menu.classList.toggle('open');
        } else {
          localStorage.setItem(REDIRECT_KEY, location.pathname.split('/').pop() || 'Nazaakat.html');
          location.href = 'login.html';
        }
      });
    });
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.naz-account-menu.open').forEach(m => {
        if (!m.parentElement.contains(e.target)) m.classList.remove('open');
      });
    });

    document.querySelectorAll('.naz-wishlist-btn').forEach(btn => {
      btn.classList.add('naz-icon-wrap');
      if (!btn.querySelector('.naz-badge')) {
        const span = document.createElement('span');
        span.className = 'naz-badge naz-wish-count';
        span.textContent = '0';
        span.style.display = 'none';
        btn.appendChild(span);
      }
      btn.addEventListener('click', openWishlist);
    });

    document.querySelectorAll('.naz-bag-btn').forEach(btn => {
      btn.classList.add('naz-icon-wrap');
      if (!btn.querySelector('.naz-badge')) {
        const span = document.createElement('span');
        span.className = 'naz-badge naz-cart-count';
        span.textContent = '0';
        span.style.display = 'none';
        btn.appendChild(span);
      }
      btn.addEventListener('click', openCart);
    });

    ready.then(() => {
      renderAccountUI();
      renderBadges();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireNav);
  } else {
    wireNav();
  }

  window.NazaakatShop = {
    ready, slug, register, login, logout, currentUser, resetPassword,
    addToCart, removeFromCart, setCartQty, getCart, refreshCart,
    toggleWishlist, isWishlisted, getWishlist, refreshWishlist,
    requireLogin, openCart, openWishlist, openOrders, getOrders,
    checkout, renderBadges, consumeRedirect,
    formatINR
  };
})();