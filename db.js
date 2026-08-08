/* ===================================================================
   Nazaakat by Saniya — SQLite database layer
   Uses Node's built-in `node:sqlite` module, so there is nothing to
   compile and no extra native dependency to install. Requires
   Node.js v22.5 or newer.
   The actual database file is created at backend/orders.db the first
   time you run the server — you can open that file directly with a
   free tool like "DB Browser for SQLite" to look at every table.
   =================================================================== */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'orders.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    image TEXT,
    price REAL NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    color TEXT,
    size TEXT,
    category TEXT,
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS wishlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    image TEXT,
    price REAL NOT NULL,
    category TEXT,
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | delivered
    subtotal REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cod', -- cod | card | upi
    payment_status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | paid
    ship_name TEXT,
    ship_phone TEXT,
    ship_address TEXT,
    ship_apartment TEXT,
    ship_city TEXT,
    ship_state TEXT,
    ship_pincode TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id TEXT,
    name TEXT NOT NULL,
    image TEXT,
    price REAL NOT NULL,
    qty INTEGER NOT NULL,
    color TEXT,
    size TEXT,
    category TEXT
  );
  CREATE TABLE IF NOT EXISTS geocode_cache (
    query TEXT PRIMARY KEY,
    lat REAL,
    lng REAL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/* Seed one default admin account the very first time the DB is created,
   so there's always a way to reach the admin panel. */
const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('Admin@123', 10);
  db.prepare(
    `INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`
  ).run('Saniya (Admin)', 'admin@nazaakat.com', '', hash);
  console.log('\n============================================================');
  console.log(' A default ADMIN account was created for you:');
  console.log('   email:    admin@nazaakat.com');
  console.log('   password: Admin@123');
  console.log(' Sign in at http://localhost:3000/admin.html');
  console.log(' Please change this password once you find a moment.');
  console.log('============================================================\n');
}

module.exports = db;