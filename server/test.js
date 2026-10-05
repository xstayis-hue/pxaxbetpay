const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Use an isolated sqlite file for tests so we don't touch dev data.
const TEST_DB = path.join(__dirname, 'test.sqlite');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.PXAX_DB_PATH = TEST_DB;

const { verifyInitData } = require('./telegramAuth');
const { getOrCreateUser, db } = require('./db');

function buildInitData(botToken, user, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAHtest');

  const pairs = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function run() {
  const botToken = '123456:FAKE_TEST_TOKEN';
  const user = { id: 42, username: 'tester', first_name: 'Test' };

  // 1. Valid signature is accepted
  const validInitData = buildInitData(botToken, user);
  const verified = verifyInitData(validInitData, botToken);
  assert.ok(verified, 'valid initData should verify');
  assert.strictEqual(verified.id, 42);
  console.log('PASS: verifyInitData accepts valid signature');

  // 2. Tampered data is rejected
  const tampered = validInitData.replace('tester', 'hacker');
  assert.strictEqual(verifyInitData(tampered, botToken), null, 'tampered initData must be rejected');
  console.log('PASS: verifyInitData rejects tampered payload');

  // 3. Wrong bot token is rejected
  assert.strictEqual(verifyInitData(validInitData, 'wrong-token'), null, 'wrong bot token must be rejected');
  console.log('PASS: verifyInitData rejects wrong bot token');

  // 4. Expired auth_date is rejected
  const oldInitData = buildInitData(botToken, user, Math.floor(Date.now() / 1000) - 100000);
  assert.strictEqual(verifyInitData(oldInitData, botToken, 86400), null, 'stale initData must be rejected');
  console.log('PASS: verifyInitData rejects expired auth_date');

  // 5. getOrCreateUser creates a user once and seeds a VPHX wallet
  const created = getOrCreateUser({ telegramId: '42', username: '@tester', firstName: 'Test', photoUrl: null });
  assert.ok(created.id, 'user should be created with an id');
  const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ? AND currency = ?').get(created.id, 'VPHX');
  assert.ok(wallet, 'VPHX wallet should be seeded for new user');
  assert.strictEqual(wallet.balance, 0);
  console.log('PASS: getOrCreateUser creates user + seeds VPHX wallet');

  // 6. getOrCreateUser is idempotent (same telegram_id -> same row, updates fields)
  const again = getOrCreateUser({ telegramId: '42', username: '@tester2', firstName: 'Test', photoUrl: null });
  assert.strictEqual(again.id, created.id, 'same telegram_id must map to same user row');
  assert.strictEqual(again.username, '@tester2', 'username should be updated on repeat login');
  const usersCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  assert.strictEqual(usersCount, 1, 'no duplicate user rows should be created');
  console.log('PASS: getOrCreateUser is idempotent per telegram_id');

  console.log('\nAll tests passed.');
}

try {
  run();
} finally {
  try { fs.unlinkSync(TEST_DB); } catch (e) {}
  try { fs.unlinkSync(TEST_DB + '-wal'); } catch (e) {}
  try { fs.unlinkSync(TEST_DB + '-shm'); } catch (e) {}
}
