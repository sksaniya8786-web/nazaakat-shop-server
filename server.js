/* ===================================================================
   Nazaakat by Saniya — local shop server
   Serves the website AND a JSON API backed by SQLite (orders.db).
   Run with:  npm install   then   npm start
   Then open: http://localhost:3000
   =================================================================== */
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(session({
  secret: 'nazaakat-local-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ ok: false, error: 'Please sign in to continue.' });
  next();
}
function requireAdmin(req, res, next) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!u || u.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin access required.' });
  req.adminUser = u;
  next();
}

/* ============================== AUTH ============================== */
app.post('/api/register', (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !password) return res.json({ ok: false, error: 'Please fill in all fields.' });
  const cleanEmail = String(email).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) return res.json({ ok: false, error: 'An account with this email already exists — please sign in instead.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)')
    .run(String(name).trim(), cleanEmail, String(phone || '').trim(), hash);
  req.session.userId = Number(info.lastInsertRowid);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  res.json({ ok: true, user: publicUser(u) });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!u) return res.json({ ok: false, error: 'No account found with that email — please register first.' });
  if (!bcrypt.compareSync(String(password || ''), u.password_hash)) {
    return res.json({ ok: false, error: 'Incorrect password. Please try again.' });
  }
  req.session.userId = u.id;
  res.json({ ok: true, user: publicUser(u) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* Local "forgot password" flow — there's no email/SMS service wired up here,
   so instead of emailing a reset link, we ask the person to confirm the
   phone number on file for that email before letting them set a new
   password. It's a light identity check, not real verification — good
   enough for a small local shop, not meant for a public internet-facing
   site with sensitive accounts. */
app.post('/api/forgot-password', (req, res) => {
  const { email, phone, newPassword } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!u) return res.json({ ok: false, error: 'No account found with that email.' });

  const onFile = String(u.phone || '').replace(/\D/g, '');
  const entered = String(phone || '').replace(/\D/g, '');
  if (!onFile || onFile !== entered) {
    return res.json({ ok: false, error: 'That phone number does not match the one on file for this account.' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.json({ ok: false, error: 'New password must be at least 6 characters.' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, u.id);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!u) { req.session.destroy(() => {}); return res.json({ user: null }); }
  res.json({ user: publicUser(u) });
});

/* ============================== CART ================================ */
app.get('/api/cart', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ?').all(req.session.userId);
  res.json({ items });
});

app.post('/api/cart', requireAuth, (req, res) => {
  const { productId, name, image, price, qty, color, size, category } = req.body || {};
  if (!productId || !name || price == null) return res.status(400).json({ ok: false, error: 'Missing product data.' });

  const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.session.userId, productId);
  if (existing) {
    db.prepare('UPDATE cart_items SET qty = qty + ? WHERE id = ?').run(qty || 1, existing.id);
  } else {
    db.prepare(`INSERT INTO cart_items (user_id, product_id, name, image, price, qty, color, size, category)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.session.userId, productId, name, image || '', price, qty || 1, color || '', size || '', category || '');
  }
  const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ?').all(req.session.userId);
  res.json({ ok: true, items });
});

app.patch('/api/cart/:productId', requireAuth, (req, res) => {
  const qty = Math.max(1, Number(req.body?.qty) || 1);
  db.prepare('UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?')
    .run(qty, req.session.userId, req.params.productId);
  const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ?').all(req.session.userId);
  res.json({ ok: true, items });
});

app.delete('/api/cart/:productId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.session.userId, req.params.productId);
  const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ?').all(req.session.userId);
  res.json({ ok: true, items });
});

/* ============================ WISHLIST =============================== */
app.get('/api/wishlist', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM wishlist_items WHERE user_id = ?').all(req.session.userId);
  res.json({ items });
});

app.post('/api/wishlist/toggle', requireAuth, (req, res) => {
  const { productId, name, image, price, category } = req.body || {};
  if (!productId) return res.status(400).json({ ok: false, error: 'Missing product id.' });

  const existing = db.prepare('SELECT * FROM wishlist_items WHERE user_id = ? AND product_id = ?').get(req.session.userId, productId);
  let added;
  if (existing) {
    db.prepare('DELETE FROM wishlist_items WHERE id = ?').run(existing.id);
    added = false;
  } else {
    db.prepare(`INSERT INTO wishlist_items (user_id, product_id, name, image, price, category)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(req.session.userId, productId, name || '', image || '', price || 0, category || '');
    added = true;
  }
  const items = db.prepare('SELECT * FROM wishlist_items WHERE user_id = ?').all(req.session.userId);
  res.json({ ok: true, added, items });
});

app.delete('/api/wishlist/:productId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?').run(req.session.userId, req.params.productId);
  const items = db.prepare('SELECT * FROM wishlist_items WHERE user_id = ?').all(req.session.userId);
  res.json({ ok: true, items });
});

/* ======================= CHECKOUT / MY ORDERS ========================= */
app.post('/api/checkout', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ?').all(req.session.userId);
  if (items.length === 0) return res.status(400).json({ ok: false, error: 'Your bag is empty.' });

  const { paymentMethod, address } = req.body || {};
  const addr = address || {};
  const method = ['cod', 'card', 'upi'].includes(paymentMethod) ? paymentMethod : 'cod';

  // Only Cash on Delivery actually works right now — card/UPI have no real
  // payment gateway wired in yet, so we don't let an order silently pretend
  // to be paid. Once a real gateway (e.g. Razorpay) is connected, this is
  // the spot to verify a real payment before creating the order.
  if (method !== 'cod') {
    return res.status(400).json({ ok: false, error: 'Card and UPI payments are coming soon — please choose Cash on Delivery for now.' });
  }

  const required = ['name', 'phone', 'address', 'city', 'state', 'pincode'];
  for (const field of required) {
    if (!addr[field] || !String(addr[field]).trim()) {
      return res.status(400).json({ ok: false, error: 'Please fill in your complete delivery address.' });
    }
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const orderInfo = db.prepare(`INSERT INTO orders
      (user_id, status, subtotal, payment_method, payment_status, ship_name, ship_phone, ship_address, ship_apartment, ship_city, ship_state, ship_pincode)
      VALUES (?, 'pending', ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.session.userId, subtotal, method, addr.name, addr.phone, addr.address, addr.apartment || '', addr.city, addr.state, addr.pincode);
  const orderId = Number(orderInfo.lastInsertRowid);

  const insertItem = db.prepare(`INSERT INTO order_items (order_id, product_id, name, image, price, qty, color, size, category)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  items.forEach(i => insertItem.run(orderId, i.product_id, i.name, i.image, i.price, i.qty, i.color, i.size, i.category));

  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.session.userId);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  res.json({ ok: true, order: { ...order, items: orderItems } });
});

app.get('/api/orders', requireAuth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId);
  const withItems = orders.map(o => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)
  }));
  res.json({ orders: withItems });
});

/* ================================ ADMIN ================================ */
app.get('/api/admin/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!u || u.role !== 'admin') return res.json({ user: null });
  res.json({ user: publicUser(u) });
});

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const customers = db.prepare(
    "SELECT id, name, email, phone, role, created_at FROM users WHERE role = 'customer' ORDER BY created_at DESC"
  ).all();
  res.json({ customers });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
    FROM orders o JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
  `).all();
  const withItems = orders.map(o => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)
  }));
  res.json({ orders: withItems });
});

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'accepted', 'delivered'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status.' });
  }
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json({ ok: true, order });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!bcrypt.compareSync(String(currentPassword || ''), req.adminUser.password_hash)) {
    return res.json({ ok: false, error: 'Current password is incorrect.' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.json({ ok: false, error: 'New password must be at least 6 characters.' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.adminUser.id);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nNazaakat by Saniya — server running!`);
  console.log(`  Shop:  http://localhost:${PORT}`);
  console.log(`  Admin: http://localhost:${PORT}/admin.html\n`);
});