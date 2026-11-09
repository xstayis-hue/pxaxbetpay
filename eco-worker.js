// PXAXBET eco-status worker.
// Единственный роут: GET /api/eco-status — агрегатор живых статусов
// миниаппов экосистемы. Воркер запускается только для /api/* (run_worker_first
// в wrangler.site.toml), остальное отдаёт статика из assets.
//
// Опрашиваемые деплои (см. DEPLOY.md в PXAXBYTECODE):
//   student → pxaxbyte            /api/health
//   ai      → pxax-nova-site      / (маркер версии v0.x в CSS-комментарии)
//   vph     → vph-site            / (атрибут data-deployment)
//   phx     → phxcoin-site        / (маркер Pre-launch в meta description)
//   predict → pxax-predict-site   /data/predictions.json (дата фида)
//
// Ответ кэшируется 30с, отдаётся с CORS * (хаб открыт и с GitHub Pages).

const SOURCES = {
  student: 'https://pxaxbyte.xstayis.workers.dev/api/health',
  ai: 'https://pxax-nova-site.xstayis.workers.dev/',
  vph: 'https://vph-site.xstayis.workers.dev/',
  phx: 'https://phxcoin-site.xstayis.workers.dev/',
  predict: 'https://pxax-predict-site.xstayis.workers.dev/data/predictions.json',
};

const PROBE_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 30000;

let cache = null;
let cacheAt = 0;

async function probe(url, parse) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cf: { cacheTtl: 0 } });
    const latencyMs = Date.now() - started;
    const body = await res.text();
    const out = { up: res.ok, status: res.status, latencyMs };
    return Object.assign(out, parse(body, res) || {});
  } catch (err) {
    return { up: false, error: 'unreachable', latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function parseStudent(body) {
  try {
    const j = JSON.parse(body);
    return { ok: j.ok === true, service: j.service, time: j.time };
  } catch (e) { return { ok: false }; }
}

function parseAi(body) {
  const m = body.match(/v(\d+\.\d+(?:\.\d+)?)/);
  return m ? { version: m[1], phase: 'test' } : {};
}

function parseVph(body) {
  const m = body.match(/data-deployment="([^"]*)"/);
  return m ? { deployment: m[1] } : {};
}

function parsePhx(body) {
  return { phase: /pre-?launch/i.test(body) ? 'prelaunch' : 'unknown' };
}

function parsePredict(body) {
  try {
    const j = JSON.parse(body);
    return { date: j.date, slot: j.slot, count: j.count, generated: j.generated };
  } catch (e) { return {}; }
}

async function collectStatus() {
  const [student, ai, vph, phx, predict] = await Promise.all([
    probe(SOURCES.student, parseStudent),
    probe(SOURCES.ai, parseAi),
    probe(SOURCES.vph, parseVph),
    probe(SOURCES.phx, parsePhx),
    probe(SOURCES.predict, parsePredict),
  ]);
  return { ts: new Date().toISOString(), services: { student, ai, vph, phx, predict } };
}

async function getStatus() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;
  const data = await collectStatus();
  cache = data;
  cacheAt = now;
  return data;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === '/api/eco-status' && request.method === 'GET') {
      const data = await getStatus();
      return new Response(JSON.stringify(data), {
        headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, CORS),
      });
    }
    return new Response('not found', { status: 404, headers: CORS });
  },
};
