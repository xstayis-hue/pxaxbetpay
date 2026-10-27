const express = require('express');
const crypto = require('crypto');
const { db, getOrCreateUser } = require('./db');
const { verifyInitData } = require('./telegramAuth');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.PXAX_BOT_TOKEN || '';
const ADMIN_KEY = process.env.PXAX_ADMIN_KEY || '';
const ALLOWED_ORIGINS = (process.env.PXAX_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-Init-Data');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- Auth middleware: verifies Telegram initData and attaches req.user ---
function requireTelegramUser(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!BOT_TOKEN) {
    return res.status(503).json({ error: 'bot_not_configured', message: 'Backend is missing PXAX_BOT_TOKEN; auth is disabled.' });
  }
  const tgUser = verifyInitData(initData, BOT_TOKEN);
  if (!tgUser) return res.status(401).json({ error: 'invalid_init_data' });

  const user = getOrCreateUser({
    telegramId: String(tgUser.id),
    username: tgUser.username ? '@' + tgUser.username : null,
    firstName: tgUser.first_name || null,
    photoUrl: tgUser.photo_url || null,
  });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const key = req.headers['authorization']?.replace(/^Bearer\s+/i, '') || '';
  if (!ADMIN_KEY || !safeEqual(key, ADMIN_KEY)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Сравнение в постоянном времени: обычное !== выходит на первом несовпавшем символе,
// и по времени ответа ключ можно подбирать посимвольно.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

app.get('/api/health', (req, res) => {
  res.json({ ready: Boolean(BOT_TOKEN && ADMIN_KEY), botConfigured: Boolean(BOT_TOKEN) });
});

// Статика приложения с того же origin, что и API. Это нужно админ-панели: прод-страница
// живёт на GitHub Pages (HTTPS) и не может звать http://localhost — браузер блокирует такой
// запрос как mixed content. Открывая страницу с этого же адреса (http://localhost:3000),
// получаем один origin: ни CORS, ни mixed content не мешают.
app.use(express.static(require('path').join(__dirname, '..')));

// --- Current user profile: telegram data + wallets + subscriptions ---
app.get('/api/me', requireTelegramUser, (req, res) => {
  const wallets = db.prepare('SELECT currency, balance FROM wallets WHERE user_id = ?').all(req.user.id);
  const subscriptions = db.prepare('SELECT product, plan, status, expires_at FROM subscriptions WHERE user_id = ?').all(req.user.id);
  res.json({
    user: {
      telegramId: req.user.telegram_id,
      username: req.user.username,
      firstName: req.user.first_name,
      photoUrl: req.user.photo_url,
    },
    wallets,
    subscriptions,
  });
});

// --- Refund requests (pxaxbetpay product) ---
app.post('/api/refund-requests', requireTelegramUser, (req, res) => {
  const {
    instagramNick, phone, region, targetInstagram, telegramUsername,
    amount, receiptName, transferMethod, transferDetails, withdrawalType, comment,
  } = req.body || {};

  if (!instagramNick || !phone || !targetInstagram || !amount || !transferMethod || !withdrawalType) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const info = db.prepare(`
    INSERT INTO refund_requests
      (user_id, instagram_nick, phone, region, target_instagram, telegram_username,
       amount, receipt_name, transfer_method, transfer_details, withdrawal_type, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, instagramNick, phone, region || null, targetInstagram,
    telegramUsername || req.user.username || null, Number(amount) || 0,
    receiptName || null, transferMethod, transferDetails || null, withdrawalType, comment || null
  );

  res.status(201).json({ id: info.lastInsertRowid, status: 'pending' });
});

app.get('/api/refund-requests/mine', requireTelegramUser, (req, res) => {
  const rows = db.prepare('SELECT * FROM refund_requests WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ requests: rows });
});

// --- Admin: list all refund requests across users ---
app.get('/api/admin/refund-requests', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.telegram_id, u.username
    FROM refund_requests r JOIN users u ON u.id = r.user_id
    ORDER BY r.created_at DESC
  `).all();
  res.json({ requests: rows });
});

app.patch('/api/admin/refund-requests/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'rejected', 'paid'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }
  db.prepare('UPDATE refund_requests SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`PXAX Core API listening on port ${PORT}`);
});

module.exports = app;
