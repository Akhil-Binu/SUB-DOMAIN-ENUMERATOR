/**
 * @file server.js
 * @description GUI web server for subenum. Serves the frontend UI and exposes
 *              two endpoints:
 *                POST /api/scan        — start a new scan (returns scanId)
 *                GET  /api/stream/:id  — SSE stream of live results
 *              Uses only Node built-ins (http, path, fs, url) — no express.
 */

import http from 'http';
import path from 'path';
import { readFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { resolveSubdomains } from './src/resolver.js';
import { fetchCrtSh } from './src/crtsh.js';
import { saveReport } from './src/reporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = 3000;

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ─── In-memory scan registry ─────────────────────────────────────────────────
/**
 * @type {Map<string, {
 *   clients: Set<import('http').ServerResponse>,
 *   results: Array<object>,
 *   done: boolean,
 *   meta: object
 * }>}
 */
const scans = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a short random scan ID.
 * @returns {string}
 */
const genId = () => Math.random().toString(36).slice(2, 10);

/**
 * Broadcast a JSON event to all SSE clients subscribed to a scan.
 * @param {string} scanId
 * @param {string} event  SSE event name
 * @param {object} data   Payload
 */
function broadcast(scanId, event, data) {
  const scan = scans.get(scanId);
  if (!scan) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of scan.clients) {
    try { client.write(payload); } catch { /* client disconnected */ }
  }
}

/**
 * Serve a static file from the public directory.
 * @param {import('http').ServerResponse} res
 * @param {string} filePath
 */
async function serveStatic(res, filePath) {
  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
}

/**
 * Parse the request body as JSON.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<object>}
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ─── Scan runner ─────────────────────────────────────────────────────────────

/**
 * Run a full subenum scan in the background, broadcasting each result via SSE.
 * @param {string} scanId
 * @param {object} opts
 */
async function runScan(scanId, opts) {
  const { domain, wordlist, threads, timeout, skipCrt, verbose } = opts;
  const scan = scans.get(scanId);

  broadcast(scanId, 'status', { msg: `Starting scan on ${domain}…` });

  try {
    // ── crt.sh ──────────────────────────────────────────────────────────────
    let crtHosts = [];
    if (!skipCrt) {
      broadcast(scanId, 'status', { msg: 'Querying crt.sh certificate logs…' });
      try {
        crtHosts = await fetchCrtSh(domain);
        broadcast(scanId, 'crt', { count: crtHosts.length });
      } catch (e) {
        broadcast(scanId, 'error', { msg: `crt.sh failed: ${e.message}` });
      }
    }

    // ── Brute-force ──────────────────────────────────────────────────────────
    const wordlistPath = path.resolve(wordlist || path.join(__dirname, 'wordlists', 'subdomains.txt'));
    broadcast(scanId, 'status', { msg: 'Starting DNS brute-force…' });

    const bruteResults = await resolveSubdomains({
      domain,
      wordlistPath,
      concurrency: threads,
      timeoutMs: timeout,
      verbose,
      source: 'bruteforce',
      onResult: (result) => {
        if (result.type !== 'none' || verbose) {
          broadcast(scanId, 'result', result);
        }
        scan.results.push(result);
      },
    });

    // ── crt.sh-only candidates ───────────────────────────────────────────────
    const resolvedNames = new Set(bruteResults.map((r) => r.subdomain));
    const crtOnly = crtHosts.filter((c) => !resolvedNames.has(c) && c.endsWith(`.${domain}`));

    if (crtOnly.length > 0) {
      broadcast(scanId, 'status', { msg: `Resolving ${crtOnly.length} CT log subdomains…` });
      await resolveSubdomains({
        domain,
        candidates: crtOnly,
        concurrency: threads,
        timeoutMs: timeout,
        verbose,
        source: 'crt.sh',
        onResult: (result) => {
          if (result.type !== 'none' || verbose) {
            broadcast(scanId, 'result', result);
          }
          scan.results.push(result);
        },
      });
    }

    // ── Save report ──────────────────────────────────────────────────────────
    const outputPath = await saveReport(scan.results, domain, path.join(__dirname, 'output'));
    const live = scan.results.filter((r) => r.type !== 'none').length;

    scan.meta = {
      domain,
      total: scan.results.length,
      live,
      aRecords: scan.results.filter((r) => r.type === 'A').length,
      cnameRecords: scan.results.filter((r) => r.type === 'CNAME').length,
      unresolvable: scan.results.filter((r) => r.type === 'none').length,
      outputPath,
    };

    broadcast(scanId, 'done', scan.meta);
  } catch (err) {
    broadcast(scanId, 'error', { msg: err.message });
  } finally {
    scan.done = true;
    // Close all SSE connections
    for (const client of scan.clients) {
      try { client.end(); } catch { /* ignore */ }
    }
    scan.clients.clear();
    // Evict scan from memory after 10 min
    setTimeout(() => scans.delete(scanId), 10 * 60 * 1000);
  }
}

// ─── HTTP server ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;

  // CORS headers (useful when developing locally)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // ── GET /api/scan — SSE stream (Vercel-compatible stateless endpoint) ────────
  if (req.method === 'GET' && pathname === '/api/scan') {
    const domain  = urlObj.searchParams.get('domain')?.trim().toLowerCase();
    const threads = parseInt(urlObj.searchParams.get('threads') ?? '50',   10);
    const timeout = parseInt(urlObj.searchParams.get('timeout') ?? '2000', 10);
    const skipCrt = urlObj.searchParams.get('skipCrt') === 'true';
    const verbose = urlObj.searchParams.get('verbose') === 'true';

    if (!domain) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'domain query parameter is required' }));
    }

    res.writeHead(200, {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(': connected\n\n');

    const send = (event, data) => {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
    };

    const wordlistPath = path.join(__dirname, 'wordlists', 'subdomains.txt');
    const allResults   = [];

    try {
      let crtHosts = [];
      if (!skipCrt) {
        send('status', { msg: 'Querying crt.sh certificate logs…' });
        try {
          crtHosts = await fetchCrtSh(domain);
          send('crt', { count: crtHosts.length });
        } catch (e) {
          send('error', { msg: `crt.sh failed: ${e.message}` });
        }
      }

      send('status', { msg: 'Starting DNS brute-force…' });
      const bruteResults = await resolveSubdomains({
        domain, wordlistPath, concurrency: threads, timeoutMs: timeout,
        verbose, source: 'bruteforce',
        onResult: (r) => { allResults.push(r); if (r.type !== 'none' || verbose) send('result', r); },
      });

      const resolvedNames = new Set(bruteResults.map((r) => r.subdomain));
      const crtOnly = crtHosts.filter((c) => !resolvedNames.has(c) && c.endsWith(`.${domain}`));

      if (crtOnly.length > 0) {
        send('status', { msg: `Resolving ${crtOnly.length} CT log subdomains…` });
        await resolveSubdomains({
          domain, candidates: crtOnly, concurrency: threads, timeoutMs: timeout,
          verbose, source: 'crt.sh',
          onResult: (r) => { allResults.push(r); if (r.type !== 'none' || verbose) send('result', r); },
        });
      }

      const outputPath = await saveReport(allResults, domain, path.join(__dirname, 'output'));
      const live        = allResults.filter((r) => r.type !== 'none').length;
      send('done', {
        domain, total: allResults.length, live,
        aRecords:    allResults.filter((r) => r.type === 'A').length,
        cnameRecords: allResults.filter((r) => r.type === 'CNAME').length,
        unresolvable: allResults.filter((r) => r.type === 'none').length,
        outputPath,
      });
    } catch (err) {
      send('error', { msg: err.message });
    } finally {
      res.end();
    }
    return;
  }

  // ── POST /api/scan — start a scan ─────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/scan') {
    try {
      const body = await parseBody(req);
      if (!body.domain) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'domain is required' }));
      }

      const scanId = genId();
      scans.set(scanId, { clients: new Set(), results: [], done: false, meta: null });

      // Fire-and-forget
      runScan(scanId, {
        domain: body.domain.trim().toLowerCase(),
        wordlist: body.wordlist || null,
        threads: parseInt(body.threads ?? 50, 10),
        timeout: parseInt(body.timeout ?? 2000, 10),
        skipCrt: Boolean(body.skipCrt),
        verbose: Boolean(body.verbose),
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ scanId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // ── GET /api/stream/:scanId — SSE stream ───────────────────────────────────
  if (req.method === 'GET' && pathname.startsWith('/api/stream/')) {
    const scanId = pathname.split('/')[3];
    const scan = scans.get(scanId);

    if (!scan) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Scan not found' }));
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    // Send a heartbeat comment immediately
    res.write(': connected\n\n');

    if (scan.done) {
      // Scan already finished — replay results and close
      for (const r of scan.results) {
        res.write(`event: result\ndata: ${JSON.stringify(r)}\n\n`);
      }
      res.write(`event: done\ndata: ${JSON.stringify(scan.meta)}\n\n`);
      return res.end();
    }

    scan.clients.add(res);
    req.on('close', () => scan.clients.delete(res));
    return; // keep connection open
  }

  // ── GET /api/results/:domain — fetch saved JSON ──────────────────────────
  if (req.method === 'GET' && pathname.startsWith('/api/results/')) {
    const domain = pathname.split('/')[3];
    try {
      const file = path.join(__dirname, 'output', `${domain}_results.json`);
      const content = await readFile(file, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Report not found' }));
    }
  }

  // ── Static file serving ───────────────────────────────────────────────────
  let filePath = PUBLIC_DIR + (pathname === '/' ? '/index.html' : pathname);
  await serveStatic(res, filePath);
});

await mkdir(path.join(__dirname, 'output'), { recursive: true });

server.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║   subenum GUI  →  http://localhost:${PORT}  ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});
