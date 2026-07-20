const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

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
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`KapMarkets lead server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
