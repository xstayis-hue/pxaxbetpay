/**
 * PXAX — статический сервер локального предпросмотра.
 * Запуск:  node server/preview.mjs
 * Открыть: http://localhost:8321/coin-preview.html
 * Порт можно поменять: PORT_PREVIEW=9000 node server/preview.mjs
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT_PREVIEW || 8321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
    const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
    const filePath = path.normalize(path.join(root, rel));
    if (!filePath.startsWith(root)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 ' + path.basename(req.url || ''));
  }
});

server.listen(PORT, () => {
  console.log('PXAX preview (static):');
  console.log('  app:      http://localhost:' + PORT + '/');
  console.log('  3D coin:  http://localhost:' + PORT + '/coin-preview.html');
});
