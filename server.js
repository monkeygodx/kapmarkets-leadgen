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

// Apple Pay domain verification content — embedded directly rather than relying on a
// public/.well-known/ file on disk, since GitHub's web uploader kept creating that path
// as a plain file instead of a folder, breaking filesystem-based serving.
const APPLE_PAY_DOMAIN_ASSOCIATION = '{"pspId":"B86BF7F89377552B43F74A2D40F511A41A3B383BF1F8EBF7AD6DF7303BA68601","version":1,"createdOn":1715203876681,"signature":"308006092a864886f70d010702a0803080020101310d300b0609608648016503040201308006092a864886f70d0107010000a080308203e330820388a003020102020816634c8b0e305717300a06082a8648ce3d040302307a312e302c06035504030c254170706c65204170706c69636174696f6e20496e746567726174696f6e204341202d20473331263024060355040b0c1d4170706c652043657274696669636174696f6e20417574686f7269747931133011060355040a0c0a4170706c6520496e632e310b3009060355040613025553301e170d3234303432393137343732375a170d3239303432383137343732365a305f3125302306035504030c1c6563632d736d702d62726f6b65722d7369676e5f5543342d50524f4431143012060355040b0c0b694f532053797374656d7331133011060355040a0c0a4170706c6520496e632e310b30090603550406130255533059301306072a8648ce3d020106082a8648ce3d03010703420004c21577edebd6c7b2218f68dd7090a1218dc7b0bd6f2c283d846095d94af4a5411b83420ed811f3407e83331f1c54c3f7eb3220d6bad5d4eff49289893e7c0f13a38202113082020d300c0603551d130101ff04023000301f0603551d2304183016801423f249c44f93e4ef27e6c4f6286c3fa2bbfd2e4b304506082b0601050507010104393037303506082b060105050730018629687474703a2f2f6f6373702e6170706c652e636f6d2f6f63737030342d6170706c65616963613330323082011d0603551d2004820114308201103082010c06092a864886f7636405013081fe3081c306082b060105050702023081b60c81b352656c69616e6365206f6e207468697320636572746966696361746520627920616e7920706172747920617373756d657320616363657074616e6365206f6620746865207468656e206170706c696361626c65207374616e64617264207465726d7320616e6420636f6e646974696f6e73206f66207573652c20636572746966696361746520706f6c69637920616e642063657274696669636174696f6e2070726163746963652073746174656d656e74732e303606082b06010505070201162a687474703a2f2f7777772e6170706c652e636f6d2f6365727469666963617465617574686f726974792f30340603551d1f042d302b3029a027a0258623687474703a2f2f63726c2e6170706c652e636f6d2f6170706c6561696361332e63726c301d0603551d0e041604149457db6fd57481868989762f7e578507e79b5824300e0603551d0f0101ff040403020780300f06092a864886f76364061d04020500300a06082a8648ce3d0403020349003046022100c6f023cb2614bb303888a162983e1a93f1056f50fa78cdb9ba4ca241cc14e25e022100be3cd0dfd16247f6494475380e9d44c228a10890a3a1dc724b8b4cb8889818bc308202ee30820275a0030201020208496d2fbf3a98da97300a06082a8648ce3d0403023067311b301906035504030c124170706c6520526f6f74204341202d20473331263024060355040b0c1d4170706c652043657274696669636174696f6e20417574686f7269747931133011060355040a0c0a4170706c6520496e632e310b3009060355040613025553301e170d3134303530363233343633305a170d3239303530363233343633305a307a312e302c06035504030c254170706c65204170706c69636174696f6e20496e746567726174696f6e204341202d20473331263024060355040b0c1d4170706c652043657274696669636174696f6e20417574686f7269747931133011060355040a0c0a4170706c6520496e632e310b30090603550406130255533059301306072a8648ce3d020106082a8648ce3d03010703420004f017118419d76485d51a5e25810776e880a2efde7bae4de08dfc4b93e13356d5665b35ae22d097760d224e7bba08fd7617ce88cb76bb6670bec8e82984ff5445a381f73081f4304606082b06010505070101043a3038303606082b06010505073001862a687474703a2f2f6f6373702e6170706c652e636f6d2f6f63737030342d6170706c65726f6f7463616733301d0603551d0e0416041423f249c44f93e4ef27e6c4f6286c3fa2bbfd2e4b300f0603551d130101ff040530030101ff301f0603551d23041830168014bbb0dea15833889aa48a99debebdebafdacb24ab30370603551d1f0430302e302ca02aa0288626687474703a2f2f63726c2e6170706c652e636f6d2f6170706c65726f6f74636167332e63726c300e0603551d0f0101ff0404030201063010060a2a864886f7636406020e04020500300a06082a8648ce3d040302036700306402303acf7283511699b186fb35c356ca62bff417edd90f754da28ebef19c815e42b789f898f79b599f98d5410d8f9de9c2fe0230322dd54421b0a305776c5df3383b9067fd177c2c216d964fc6726982126f54f87a7d1b99cb9b0989216106990f09921d00003182018930820185020101308186307a312e302c06035504030c254170706c65204170706c69636174696f6e20496e746567726174696f6e204341202d20473331263024060355040b0c1d4170706c652043657274696669636174696f6e20417574686f7269747931133011060355040a0c0a4170706c6520496e632e310b3009060355040613025553020816634c8b0e305717300b0609608648016503040201a08193301806092a864886f70d010903310b06092a864886f70d010701301c06092a864886f70d010905310f170d3234303530383231333131365a302806092a864886f70d010934311b3019300b0609608648016503040201a10a06082a8648ce3d040302302f06092a864886f70d010904312204209dbaa2c4dea464986df093cdbd726cab47580e933c43639c2401d71b0bf64fca300a06082a8648ce3d040302044830460221008f5bd0307b0a7438610c92f55a6481dbe087e4e54db53cba22a4625b26f6942b022100bd16046cbdbf44c9a5c7427c749c1b6bd5fcae549c79a02044ed560664e2513c000000000000"}';

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

// Apple Pay domain verification — served from the embedded constant above,
// not from disk. Registered BEFORE express.static so it always wins, even if
// a stale/broken .well-known file is still sitting in the repo from earlier attempts.
app.get('/.well-known/apple-developer-merchantid-domain-association', (req, res) => {
  res.type('application/json').send(APPLE_PAY_DOMAIN_ASSOCIATION);
});

app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'allow' }));

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
