/* Source-contract test for the pxaxbetpay admin panel.
   Runs with zero dependencies, so it works in CI without native builds.

   It pins down the properties that matter:
   - the page carries no admin credential (login, password hash, client-side check)
   - the panel reads data from the protected API, not from localStorage
   - the server keeps both admin routes behind requireAdmin (Bearer PXAX_ADMIN_KEY)

   The end-to-end behaviour (wrong key -> 401, right key -> list, PATCH -> status)
   was verified against a live server in a browser; see README, "Проверка админки".

   Usage: node server/test-admin.js
*/
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// ---- the page must not contain any credential ----
assert.ok(!/09pX90Ax/.test(html), 'hardcoded admin login must be gone');
assert.ok(!/f2a6b6f7a5c2d4e3f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8/.test(html),
  'hardcoded password hash must be gone');
assert.ok(!/\bloginAdmin\b/.test(html), 'client-side loginAdmin must be gone');
assert.ok(!/\bloadApplications\b/.test(html), 'client-side admin listing must be gone');
assert.ok(!/getElementById\('admin-username'\)/.test(html), 'login field must be gone');
console.log('PASS: index.html carries no admin credential and no client-side check');

// ---- the panel must talk to the protected API ----
assert.ok(/\/api\/admin\/refund-requests/.test(html), 'admin panel must call the protected API');
assert.ok(/Authorization:\s*'Bearer '\s*\+\s*key/.test(html), 'admin requests must send the bearer key');
assert.ok(/sessionStorage/.test(html), 'the key must be kept in sessionStorage');
assert.ok(!/localStorage\.setItem\('pxax_admin_key'/.test(html),
  'the admin key must not be written to localStorage');
console.log('PASS: admin panel uses the protected API and sessionStorage');

// ---- every response field must be rendered through the escaper ----
const renderCall = html.slice(html.indexOf('function renderAdminApplications'), html.indexOf('async function adminSetStatus'));
assert.ok(renderCall.length > 0, 'renderAdminApplications must exist');
const rawInterpolations = renderCall.match(/\$\{[^}]*\}/g) || [];
assert.strictEqual(rawInterpolations.length, 0,
  'admin listing must not interpolate server data raw (use escHtml)');
assert.ok((renderCall.match(/escHtml\(/g) || []).length >= 10, 'each server field must be escaped');
console.log('PASS: server data in the admin list is HTML-escaped');

// ---- the server must keep both admin routes protected ----
assert.ok(/function requireAdmin/.test(server), 'server must define requireAdmin');
const adminRoutes = server.match(/app\.(get|patch)\('\/api\/admin\/refund-requests[^']*',\s*requireAdmin/g) || [];
assert.strictEqual(adminRoutes.length, 2, 'both admin routes must be behind requireAdmin');
assert.ok(/if \(!ADMIN_KEY \|\| !safeEqual\(key, ADMIN_KEY\)\) return res\.status\(401\)/.test(server),
  'requireAdmin must reject a missing or wrong key');
assert.ok(/crypto\.timingSafeEqual/.test(server),
  'key comparison must be constant-time');
assert.ok(/PXAX_ADMIN_KEY/.test(server), 'the key must come from the environment');
console.log('PASS: both admin routes require Authorization: Bearer <PXAX_ADMIN_KEY>');

// ---- the key must not be committed anywhere in the repo ----
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.name === '.git' || e.name === 'node_modules') return [];
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const leaked = walk(ROOT).filter((f) => /\.(html|js|mjs|json|md|toml|yml|example)$/.test(f)
  && /PXAX_ADMIN_KEY\s*=\s*['"][^'"]{8,}['"]/.test(fs.readFileSync(f, 'utf8')));
assert.deepStrictEqual(leaked, [], 'PXAX_ADMIN_KEY must never be set in the repository');
console.log('PASS: no PXAX_ADMIN_KEY value is committed');

console.log('\nAll admin contract tests passed.');
