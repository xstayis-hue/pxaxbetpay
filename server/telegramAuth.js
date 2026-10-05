const crypto = require('crypto');

/**
 * Verifies Telegram WebApp initData per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Returns parsed user object if valid and fresh, otherwise null.
 */
function verifyInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch (e) {
    return null;
  }
  if (!user || !user.id) return null;
  return user;
}

module.exports = { verifyInitData };
