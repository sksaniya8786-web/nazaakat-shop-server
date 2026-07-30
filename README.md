# Nazaakat by Saniya — Local Shop Server

This turns your website into a real (local) online shop: customers can
register, log in, add to bag/wishlist, and place orders. Everything is
saved in a real **SQLite database file** (`orders.db`) that you can open
and inspect. You get an **Admin Panel** where you accept and deliver
orders.

You do **not** need to know how to code. Just follow the steps below,
copy-pasting the two commands where indicated.

---

## 1. Install Node.js (one-time only)

If you don't already have it:

1. Go to **https://nodejs.org**
2. Download and install the **LTS** version (anything v22 or newer).
3. Restart your computer's terminal / command prompt after installing.

To check it worked, open a terminal (Command Prompt / Terminal / PowerShell)
and type:

```
node --version
```

You should see something like `v22.x.x`. If the number is lower than
22.5, please install a newer version from nodejs.org — the database
feature this project uses needs Node 22.5 or newer.

---

## 2. Install the project's dependencies (one-time only)

Open a terminal, navigate into this folder (the one containing
`package.json`), and run:

```
npm install
```

This downloads three small helper libraries (Express, bcryptjs,
express-session). It only needs to be done once, or again if you ever
delete the `node_modules` folder.

---

## 3. Start the server

Every time you want to run your shop, from this same folder run:

```
npm start
```

You should see something like:

```
Nazaakat by Saniya — server running!
  Shop:  http://localhost:3000
  Admin: http://localhost:3000/admin.html
```

Leave this terminal window open — closing it stops the server.

---

## 4. Open the site

- **Shop (customers):** http://localhost:3000
- **Admin panel (you):** http://localhost:3000/admin.html

> Important: always open the site through `http://localhost:3000`,
> **not** by double-clicking the HTML files directly. Double-clicking
> opens them with no server behind them, so login/cart/orders won't work.

---

## 5. Log in to the Admin Panel

The first time the server runs, it automatically creates one admin
account for you:

```
Email:    admin@nazaakat.com
Password: Admin@123
```

Go to **http://localhost:3000/admin.html**, sign in with those details,
then use the "Change Password" button in the top-right to set your own
password.

In the admin panel you can:
- See every **customer** who has registered (name, email, phone, date joined)
- See every **order** placed, with the products, quantity, and total
- Click **Accept Order** to move it from *Pending → Accepted*
- Click **Mark Delivered** once it's out for delivery

---

## 6. Where is the database?

A file called **`orders.db`** appears in this folder the first time you
run the server. That's a real SQLite database file containing every
table: `users`, `orders`, `order_items`, `cart_items`, `wishlist_items`.

To browse it visually:

1. Download the free tool **DB Browser for SQLite**: https://sqlitebrowser.org
2. Open it, choose **Open Database**, and select `orders.db` from this folder.
3. Click the **Browse Data** tab and pick a table (e.g. `orders` or `users`) from the dropdown.

You can look, filter, and even edit data directly there if you ever need to.

---

## 7. Stopping / restarting

- To stop the server: click into the terminal window and press `Ctrl + C`.
- To start it again later: just run `npm start` again from this folder.
- Your data (customers, orders) stays in `orders.db` between restarts —
  it is not lost when you stop the server.

---

## Notes & honest limitations

- This is a **local** server — it runs on your own computer and is only
  reachable at `localhost`. It is not on the internet. If you want
  customers to actually order from anywhere, this project would need to
  be deployed to a hosting service (Render, Railway, a VPS, etc.) —
  ask me if you'd like help with that step later.
- Passwords are stored securely (hashed with bcrypt), not as plain text.
- There's no real payment gateway wired in — "Proceed to Checkout"
  creates a Pending order for you to confirm manually, which matches
  how you described wanting to accept orders yourself.
- If you ever want to wipe all data and start over, simply stop the
  server and delete `orders.db` — a fresh empty one (with a new default
  admin account) will be created the next time you run `npm start`.
