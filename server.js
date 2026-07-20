const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const SQUARE_APPLICATION_ID = process.env.SQUARE_APPLICATION_ID;
const SQUARE_ENV = process.env.SQUARE_ENV || 'production'; // 'production' or 'sandbox'
const SQUARE_API_BASE = SQUARE_ENV === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

// --- Product catalog — EDIT these titles/prices to match your actual e-books ---
const PRODUCTS = {
  book1: { name: 'E-Book 1: [Replace With Real Title]', priceCents: 2700 },
  book2: { name: 'E-Book 2: [Replace With Real Title]', priceCents: 2700 },
  book3: { name: 'E-Book 3: [Replace With Real Title]', priceCents: 2700 },
  bundle: { name: 'All 3 E-Books — Bundle', priceCents: 5700 }
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      country_code TEXT NOT NULL,
      phone TEXT NOT NULL,
      sms_followup BOOLEAN NOT NULL DEFAULT FALSE,
      sms_promo BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_ref TEXT UNIQUE NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      square_payment_link_id TEXT,
      square_order_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'allow' }));

// Explicit route as a guaranteed fallback for Apple Pay domain verification —
// static dotfile serving alone is enough once 'dotfiles: allow' is set above,
// but this route ensures it works even if static config changes later.
app.get('/.well-known/apple-developer-merchantid-domain-association', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', '.well-known', 'apple-developer-merchantid-domain-association'));
});

app.post('/api/leads', async (req, res) => {
  const { fullName, email, countryCode, phone, smsFollowup, smsPromo } = req.body || {};

  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    return res.status(400).json({ error: 'fullName is required' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'valid email is required' });
  }
  if (!phone || phone.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ error: 'valid phone is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO leads (full_name, email, country_code, phone, sms_followup, sms_promo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, submitted_at`,
      [
        fullName.trim(),
        email.trim().toLowerCase(),
        countryCode || '+1',
        phone.trim(),
        Boolean(smsFollowup),
        Boolean(smsPromo)
      ]
    );
    return res.status(201).json({ id: result.rows[0].id, submittedAt: result.rows[0].submitted_at });
  } catch (err) {
    console.error('Failed to insert lead:', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

// Simple protected view of captured leads: /api/leads?key=YOUR_ADMIN_KEY
app.get('/api/leads', async (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, country_code, phone, sms_followup, sms_promo, submitted_at
       FROM leads ORDER BY submitted_at DESC`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch leads:', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Public config for the frontend Web Payments SDK — application ID and location ID
// are not secret (they're meant to be used client-side); the access token never is.
app.get('/api/config', (req, res) => {
  res.json({
    squareApplicationId: SQUARE_APPLICATION_ID || null,
    squareLocationId: SQUARE_LOCATION_ID || null,
    squareEnv: SQUARE_ENV
  });
});

// Product lookup for the checkout page to render name/price without duplicating it in HTML
app.get('/api/products/:productId', (req, res) => {
  const product = PRODUCTS[req.params.productId];
  if (!product) {
    return res.status(404).json({ error: 'unknown productId' });
  }
  res.json({ productId: req.params.productId, name: product.name, priceCents: product.priceCents });
});

// Charges a card directly using a Square Web Payments SDK token (sourceId).
// This is what powers the on-site checkout page instead of redirecting to Square.
app.post('/api/process-payment', async (req, res) => {
  const { productId, sourceId } = req.body || {};
  const product = PRODUCTS[productId];

  if (!product) {
    return res.status(400).json({ error: 'unknown productId' });
  }
  if (!sourceId) {
    return res.status(400).json({ error: 'missing payment token' });
  }
  if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
    return res.status(500).json({ error: 'Square is not configured on this server' });
  }

  const orderRef = crypto.randomUUID();

  try {
    await pool.query(
      `INSERT INTO orders (order_ref, product_id, product_name, price_cents, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [orderRef, productId, product.name, product.priceCents]
    );

    const squareRes = await fetch(`${SQUARE_API_BASE}/v2/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Square-Version': '2024-06-20'
      },
      body: JSON.stringify({
        idempotency_key: orderRef,
        source_id: sourceId,
        location_id: SQUARE_LOCATION_ID,
        amount_money: {
          amount: product.priceCents,
          currency: 'USD'
        },
        note: `${product.name} — order ${orderRef}`
      })
    });

    const data = await squareRes.json();

    if (!squareRes.ok || !data.payment || data.payment.status !== 'COMPLETED') {
      console.error('Square payment error:', data);
      await pool.query(`UPDATE orders SET status = 'failed' WHERE order_ref = $1`, [orderRef]);
      const declineMsg = data.errors && data.errors[0] ? data.errors[0].detail : 'Payment was declined.';
      return res.status(402).json({ error: declineMsg });
    }

    await pool.query(
      `UPDATE orders SET status = 'paid', square_order_id = $1 WHERE order_ref = $2`,
      [data.payment.order_id || null, orderRef]
    );

    return res.json({ orderRef, status: 'paid' });
  } catch (err) {
    console.error('Payment processing failed:', err);
    await pool.query(`UPDATE orders SET status = 'failed' WHERE order_ref = $1`, [orderRef]).catch(() => {});
    return res.status(500).json({ error: 'Payment processing failed. Please try again.' });
  }
});

// Create a Square-hosted checkout link for a product and redirect the buyer there
app.post('/api/checkout', async (req, res) => {
  const { productId } = req.body || {};
  const product = PRODUCTS[productId];

  if (!product) {
    return res.status(400).json({ error: 'unknown productId' });
  }
  if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
    return res.status(500).json({ error: 'Square is not configured on this server' });
  }

  const orderRef = crypto.randomUUID();

  try {
    const squareRes = await fetch(`${SQUARE_API_BASE}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Square-Version': '2024-06-20'
      },
      body: JSON.stringify({
        idempotency_key: orderRef,
        quick_pay: {
          name: product.name,
          price_money: {
            amount: product.priceCents,
            currency: 'USD'
          },
          location_id: SQUARE_LOCATION_ID
        },
        checkout_options: {
          redirect_url: `${PUBLIC_URL}/download.html?order=${orderRef}`
        }
      })
    });

    const data = await squareRes.json();

    if (!squareRes.ok) {
      console.error('Square API error:', data);
      return res.status(502).json({ error: 'payment link creation failed' });
    }

    await pool.query(
      `INSERT INTO orders (order_ref, product_id, product_name, price_cents, square_payment_link_id, square_order_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [orderRef, productId, product.name, product.priceCents, data.payment_link.id, data.payment_link.order_id]
    );

    return res.json({ checkoutUrl: data.payment_link.url, orderRef });
  } catch (err) {
    console.error('Checkout creation failed:', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

// Square calls this after payment completes (configure in Square Dashboard > Webhooks).
// Kept as a best-effort signal; the download page's /verify call below is the source of truth.
app.post('/api/square-webhook', async (req, res) => {
  res.status(200).send('ok');
});

// The download page calls this after redirect — checks the real payment status
// directly against Square's Orders API rather than trusting the redirect alone.
app.get('/api/orders/:orderRef/verify', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT order_ref, product_id, product_name, status, square_order_id FROM orders WHERE order_ref = $1`,
      [req.params.orderRef]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'not found' });
    }
    const order = result.rows[0];

    if (order.status === 'paid') {
      return res.json({ orderRef: order.order_ref, productId: order.product_id, productName: order.product_name, status: 'paid' });
    }

    if (!order.square_order_id) {
      return res.json({ orderRef: order.order_ref, productId: order.product_id, productName: order.product_name, status: order.status });
    }

    const squareRes = await fetch(`${SQUARE_API_BASE}/v2/orders/${order.square_order_id}`, {
      headers: {
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Square-Version': '2024-06-20'
      }
    });
    const data = await squareRes.json();

    const isPaid = squareRes.ok && data.order && data.order.tenders && data.order.tenders.length > 0;

    if (isPaid) {
      await pool.query(`UPDATE orders SET status = 'paid' WHERE order_ref = $1`, [order.order_ref]);
    }

    return res.json({
      orderRef: order.order_ref,
      productId: order.product_id,
      productName: order.product_name,
      status: isPaid ? 'paid' : 'pending'
    });
  } catch (err) {
    console.error('Order verify failed:', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

// Lets the download page check whether an order actually went through
app.get('/api/orders/:orderRef', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT order_ref, product_id, product_name, status FROM orders WHERE order_ref = $1`,
      [req.params.orderRef]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Order lookup failed:', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`KapMarkets lead server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
