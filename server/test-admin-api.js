/* End-to-end test of the admin API using the REAL server/server.js.
   The two native deps are provided outside the repo (better-sqlite3 shim over node:sqlite),
   so this runs on any machine without a C++ toolchain:
     NODE_PATH=<deps>/node_modules node server/test-admin-api.js
   If better-sqlite3 is properly installed, run it without NODE_PATH.

   Usage: node server/test-admin-api.js
*/
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const TEST_DB = path.join(__dirname, 'test-admin-api.sqlite');
for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(TEST_DB + s); } catch (e) {} }

const PORT = 3422;
const ADMIN_KEY = 'admin-key-for-tests-32-characters';
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, PORT: String(PORT), PXAX_ADMIN_KEY: ADMIN_KEY, PXAX_DB_PATH: TEST_DB, PXAX_BOT_TOKEN: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));

const request = (method, route, headers = {}, body = null) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: route, method, headers }, (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
  });
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      await wait(200);
      try { await request('GET', '/api/health'); up = true; } catch (e) {}
    }
    assert.ok(up, 'server must start (check NODE_PATH for better-sqlite3)');
    console.log('PASS: server started with the isolated db');

    const noKey = await request('GET', '/api/admin/refund-requests');
    assert.strictEqual(noKey.status, 401, 'no key -> 401');
    console.log('PASS: GET admin list without key -> 401');

    const wrong = await request('GET', '/api/admin/refund-requests', { Authorization: 'Bearer nope' });
    assert.strictEqual(wrong.status, 401, 'wrong key -> 401');
    console.log('PASS: GET admin list with wrong key -> 401');

    const ok = await request('GET', '/api/admin/refund-requests', { Authorization: 'Bearer ' + ADMIN_KEY });
    assert.strictEqual(ok.status, 200, 'right key -> 200');
    assert.ok(Array.isArray(JSON.parse(ok.body).requests), 'list must be an array');
    console.log('PASS: GET admin list with right key -> 200 requests[]');

    const patchNoKey = await request('PATCH', '/api/admin/refund-requests/1', {}, '{}');
    assert.strictEqual(patchNoKey.status, 401, 'PATCH without key -> 401');
    console.log('PASS: PATCH status without key -> 401');

    // the page is served from the same origin (so the panel works without CORS/mixed content)
    const page = await request('GET', '/');
    assert.strictEqual(page.status, 200, 'server must serve the app itself');
    assert.match(page.body, /admin-panel/, 'served page must be the app');
    console.log('PASS: server serves index.html on the same origin as the API');

    console.log('\nAll admin API tests passed.');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    child.kill();
    await wait(300);
    for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(TEST_DB + s); } catch (e) {} }
  }
})();
