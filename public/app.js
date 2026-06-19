/**
 * @file app.js
 * @description Frontend logic for the subenum GUI.
 *              Compatible with both local server.js and Vercel serverless.
 *              Uses GET-based SSE endpoint (/api/scan?domain=...) — stateless,
 *              no scanId handshake required.
 */

'use strict';

// ─── Canvas grid background ──────────────────────────────────────────────────

(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H;
  const CELL = 36;
  const COLOR = 'rgba(0, 212, 255, 0.07)';

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = 0.5;
    const cols = Math.ceil(W / CELL);
    const rows = Math.ceil(H / CELL);
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke();
    }
    const grad = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.85);
    grad.addColorStop(0, 'rgba(8,12,18,0)');
    grad.addColorStop(1, 'rgba(8,12,18,0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  window.addEventListener('resize', () => { resize(); draw(); });
  resize();
  draw();
})();

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const form           = document.getElementById('scan-form');
const btnScan        = document.getElementById('btn-scan');
const btnStop        = document.getElementById('btn-stop');
const btnClear       = document.getElementById('btn-clear');
const btnExport      = document.getElementById('btn-export');
const termBody       = document.getElementById('terminal-body');
const progressWrap   = document.getElementById('progress-wrap');
const progressBar    = document.getElementById('progress-bar');
const progressStatus = document.getElementById('progress-status');
const exportWrap     = document.getElementById('export-wrap');
const resultsSection = document.getElementById('results-section');
const resultsTbody   = document.getElementById('results-tbody');
const filterTabs     = document.getElementById('filter-tabs');

const valTotal = document.getElementById('val-total');
const valLive  = document.getElementById('val-live');
const valCname = document.getElementById('val-cname');
const valCrt   = document.getElementById('val-crt');
const valFail  = document.getElementById('val-fail');

// ─── State ────────────────────────────────────────────────────────────────────

let evtSource     = null;
let currentDomain = '';
let allResults    = [];
let stats         = { total: 0, live: 0, cname: 0, crt: 0, fail: 0 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** HTML-escape to prevent XSS. */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Pad string to fixed column width. */
function padEnd(str, width) {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

/**
 * Append a colored line to the terminal.
 * @param {'live'|'cname'|'failed'|'info'|'done'|'err'} cls
 */
function termLine(cls, tag, host, addr = '', type = '') {
  const welcome = termBody.querySelector('.terminal-welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `t-line ${cls}`;
  div.innerHTML =
    `<span class="t-tag">${escHtml(tag)}</span>` +
    `<span class="t-host">${escHtml(host)}</span>` +
    (addr ? `<span class="t-addr"> → ${escHtml(addr)}</span>` : '') +
    (type ? `<span class="t-type"> (${escHtml(type)})</span>` : '');

  termBody.appendChild(div);
  termBody.scrollTop = termBody.scrollHeight;
}

/** Animate a stat counter. */
function animateStat(el, target) {
  el.textContent = String(target);
  const card = el.closest('.stat-card');
  if (card) {
    card.classList.remove('bump');
    void card.offsetWidth;
    card.classList.add('bump');
  }
}

/** Update all stat counters. */
function updateStats() {
  animateStat(valTotal, stats.total);
  animateStat(valLive,  stats.live);
  animateStat(valCname, stats.cname);
  animateStat(valCrt,   stats.crt);
  animateStat(valFail,  stats.fail);
}

/** Add a row to the results table. */
function addTableRow(result) {
  const { subdomain, addresses, type, source, timestamp } = result;
  const tr = document.createElement('tr');
  tr.dataset.type   = type;
  tr.dataset.source = source;

  const addrDisplay = addresses.length > 0
    ? escHtml(addresses.join(', '))
    : '<span style="color:var(--text-dim)">—</span>';

  const typeBadge = type !== 'none'
    ? `<span class="badge badge-${escHtml(type)}">${escHtml(type)}</span>`
    : '<span style="color:var(--text-dim)">none</span>';

  const sourceBadge = source === 'crt.sh'
    ? `<span class="badge badge-crt">crt.sh</span>`
    : `<span class="badge badge-brute">brute</span>`;

  const ts = new Date(timestamp).toLocaleTimeString();

  tr.innerHTML =
    `<td style="color:var(--text-bright)">${escHtml(subdomain)}</td>` +
    `<td>${addrDisplay}</td>` +
    `<td>${typeBadge}</td>` +
    `<td>${sourceBadge}</td>` +
    `<td style="color:var(--text-dim)">${escHtml(ts)}</td>`;

  resultsTbody.appendChild(tr);
}

/** Show indeterminate progress bar. */
function pulseProgress(msg) {
  progressWrap.classList.remove('hidden');
  progressStatus.textContent = msg ?? 'Working…';
  progressBar.style.width = '60%';
}

/** Hide progress bar. */
function hideProgress() {
  progressBar.style.width = '100%';
  setTimeout(() => progressWrap.classList.add('hidden'), 600);
}

/** Toggle scanning UI state. */
function setScanningState(on) {
  if (on) {
    btnScan.classList.add('scanning');
    btnScan.querySelector('.btn-label').textContent = 'Scanning…';
    btnStop.classList.remove('hidden');
    exportWrap.classList.add('hidden');
  } else {
    btnScan.classList.remove('scanning');
    btnScan.querySelector('.btn-label').textContent = 'Launch Scan';
    btnStop.classList.add('hidden');
  }
}

/** Stop the active SSE stream. */
function stopScan() {
  if (evtSource) {
    evtSource.close();
    evtSource = null;
    termLine('info', '[■]', 'Scan stopped by user.');
    setScanningState(false);
    hideProgress();
    if (allResults.length > 0) exportWrap.classList.remove('hidden');
  }
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

filterTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  filterTabs.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  tab.classList.add('active');
  const filter = tab.dataset.filter;
  resultsTbody.querySelectorAll('tr').forEach((tr) => {
    if (filter === 'all') {
      tr.classList.remove('hidden');
    } else if (filter === 'A' || filter === 'CNAME') {
      tr.classList.toggle('hidden', tr.dataset.type !== filter);
    } else {
      tr.classList.toggle('hidden', tr.dataset.source !== filter);
    }
  });
});

// ─── Clear terminal ───────────────────────────────────────────────────────────

btnClear.addEventListener('click', () => {
  termBody.innerHTML = '';
});

// ─── Stop button ──────────────────────────────────────────────────────────────

btnStop.addEventListener('click', stopScan);

// ─── Export (client-side JSON bundle — works on Vercel) ───────────────────────

btnExport.addEventListener('click', () => {
  if (!currentDomain || allResults.length === 0) return;

  const liveResults = allResults.filter((r) => r.type !== 'none');

  const report = {
    meta: {
      domain:          currentDomain,
      generatedAt:     new Date().toISOString(),
      totalCandidates: allResults.length,
      liveCount:       liveResults.length,
      aRecords:        allResults.filter((r) => r.type === 'A').length,
      cnameRecords:    allResults.filter((r) => r.type === 'CNAME').length,
      unresolvable:    allResults.filter((r) => r.type === 'none').length,
    },
    results: allResults,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${currentDomain}_results.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ─── Form submit ──────────────────────────────────────────────────────────────

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const domain = document.getElementById('domain').value.trim().toLowerCase();
  if (!domain) { document.getElementById('domain').focus(); return; }

  // Kill any running scan
  if (evtSource) stopScan();

  // Reset state
  currentDomain          = domain;
  allResults             = [];
  stats                  = { total: 0, live: 0, cname: 0, crt: 0, fail: 0 };
  termBody.innerHTML     = '';
  resultsTbody.innerHTML = '';
  resultsSection.classList.add('hidden');
  exportWrap.classList.add('hidden');
  updateStats();

  setScanningState(true);
  pulseProgress('Connecting…');

  termLine('info', '[◈]', `Target  : ${domain}`);
  termLine('info', '[◈]', `Threads : ${document.getElementById('threads').value}   Timeout : ${document.getElementById('timeout').value}ms`);

  // ── Build query string and open SSE (stateless GET — works on Vercel) ───────
  const params = new URLSearchParams({
    domain,
    threads: document.getElementById('threads').value,
    timeout: document.getElementById('timeout').value,
    skipCrt: document.getElementById('skip-crt').checked ? 'true' : 'false',
    verbose: document.getElementById('verbose').checked  ? 'true' : 'false',
  });

  evtSource = new EventSource(`/api/scan?${params}`);

  evtSource.addEventListener('status', (e) => {
    const { msg } = JSON.parse(e.data);
    pulseProgress(msg);
    termLine('info', '[~]', msg);
  });

  evtSource.addEventListener('crt', (e) => {
    const { count } = JSON.parse(e.data);
    stats.crt = count;
    animateStat(valCrt, count);
    termLine('info', '[crt]', `Found ${count} subdomains from certificate logs`);
  });

  evtSource.addEventListener('result', (e) => {
    const result = JSON.parse(e.data);
    allResults.push(result);
    stats.total++;

    if (result.type === 'A') {
      stats.live++;
      termLine('live',   '[+]', result.subdomain, result.addresses[0] ?? '', 'A');
    } else if (result.type === 'CNAME') {
      stats.cname++;
      termLine('cname',  '[+]', result.subdomain, result.addresses[0] ?? '', 'CNAME');
    } else {
      stats.fail++;
      termLine('failed', '[-]', result.subdomain, 'unresolvable');
    }

    updateStats();

    if (result.type !== 'none') {
      resultsSection.classList.remove('hidden');
      addTableRow(result);
    }
  });

  evtSource.addEventListener('done', (e) => {
    const meta = JSON.parse(e.data);
    termLine('done', '[✓]', `Done — ${meta.live} live / ${meta.unresolvable} failed / ${meta.total} total`);

    setScanningState(false);
    hideProgress();
    if (allResults.length > 0) exportWrap.classList.remove('hidden');

    evtSource.close();
    evtSource = null;
  });

  evtSource.addEventListener('error', (e) => {
    try {
      const { msg } = JSON.parse(e.data);
      termLine('err', '[!]', msg);
    } catch {
      if (evtSource?.readyState === EventSource.CLOSED) {
        termLine('err', '[!]', 'Connection lost — scan may have timed out on the server.');
        setScanningState(false);
        hideProgress();
        if (allResults.length > 0) exportWrap.classList.remove('hidden');
      }
    }
  });

  evtSource.onerror = () => {
    if (evtSource && evtSource.readyState === EventSource.CLOSED) {
      setScanningState(false);
      hideProgress();
      evtSource = null;
    }
  };
});
