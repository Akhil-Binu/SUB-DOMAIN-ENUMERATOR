/**
 * @file app.js
 * @description Frontend logic for the subenum GUI.
 *              Handles form submission, SSE streaming, live terminal output,
 *              animated stats counters, result table filtering, and JSON export.
 */

'use strict';

// ─── Canvas grid background ──────────────────────────────────────────────────

(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, cols, rows;

  const CELL = 36;
  const COLOR = 'rgba(0, 212, 255, 0.07)';

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cols = Math.ceil(W / CELL);
    rows = Math.ceil(H / CELL);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = 0.5;

    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, H);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(W, y * CELL);
      ctx.stroke();
    }

    // Draw a subtle radial vignette fade
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
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

const form       = document.getElementById('scan-form');
const btnScan    = document.getElementById('btn-scan');
const btnStop    = document.getElementById('btn-stop');
const btnClear   = document.getElementById('btn-clear');
const btnExport  = document.getElementById('btn-export');
const termBody   = document.getElementById('terminal-body');
const progressWrap = document.getElementById('progress-wrap');
const progressBar  = document.getElementById('progress-bar');
const progressStatus = document.getElementById('progress-status');
const exportWrap = document.getElementById('export-wrap');
const resultsSection = document.getElementById('results-section');
const resultsTbody   = document.getElementById('results-tbody');
const filterTabs     = document.getElementById('filter-tabs');

const valTotal = document.getElementById('val-total');
const valLive  = document.getElementById('val-live');
const valCname = document.getElementById('val-cname');
const valCrt   = document.getElementById('val-crt');
const valFail  = document.getElementById('val-fail');

// ─── State ────────────────────────────────────────────────────────────────────

let evtSource = null;  // current EventSource
let currentDomain = '';
let allResults = [];   // all SubdomainResult objects received
let stats = { total: 0, live: 0, cname: 0, crt: 0, fail: 0 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Append a colored line to the terminal.
 * @param {string} cls   CSS class: 'live' | 'cname' | 'failed' | 'info' | 'done' | 'err'
 * @param {string} tag   Left label e.g. '[+]'
 * @param {string} host  Subdomain name
 * @param {string} [addr] Address / extra info
 * @param {string} [type] Record type annotation
 */
function termLine(cls, tag, host, addr = '', type = '') {
  // Remove welcome screen on first real line
  const welcome = termBody.querySelector('.terminal-welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `t-line ${cls}`;
  div.innerHTML =
    `<span class="t-tag">${tag}</span>` +
    `<span class="t-host">${escHtml(host)}</span>` +
    (addr ? `<span class="t-addr"> → ${escHtml(addr)}</span>` : '') +
    (type ? `<span class="t-type"> (${escHtml(type)})</span>` : '');

  termBody.appendChild(div);
  termBody.scrollTop = termBody.scrollHeight;
}

/** HTML-escape a string to prevent XSS from domain/host values. */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Animate a stat counter to a new value.
 * @param {HTMLElement} el
 * @param {number} target
 */
function animateStat(el, target) {
  const current = parseInt(el.textContent, 10) || 0;
  if (current === target) return;
  el.textContent = String(target);
  el.closest('.stat-card')?.classList.remove('bump');
  void el.closest('.stat-card')?.offsetWidth; // reflow
  el.closest('.stat-card')?.classList.add('bump');
}

/**
 * Update all stat counters.
 */
function updateStats() {
  animateStat(valTotal, stats.total);
  animateStat(valLive,  stats.live);
  animateStat(valCname, stats.cname);
  animateStat(valCrt,   stats.crt);
  animateStat(valFail,  stats.fail);
}

/**
 * Add a row to the results table.
 * @param {object} result  SubdomainResult
 */
function addTableRow(result) {
  const { subdomain, addresses, type, source, timestamp } = result;
  const tr = document.createElement('tr');
  tr.dataset.type   = type;
  tr.dataset.source = source;

  const addrDisplay = addresses.length > 0
    ? addresses.join(', ')
    : '<span style="color:var(--text-dim)">—</span>';

  const typeBadge   = type !== 'none'
    ? `<span class="badge badge-${type}">${type}</span>`
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
    `<td style="color:var(--text-dim)">${ts}</td>`;

  resultsTbody.appendChild(tr);
}

/** Indeterminate progress pulse. */
function pulseProgress(msg) {
  progressWrap.classList.remove('hidden');
  progressStatus.textContent = msg ?? 'Working…';
  // Animate bar back and forth (indeterminate)
  progressBar.style.width = '60%';
}

/** Hide progress bar. */
function hideProgress() {
  progressBar.style.width = '100%';
  setTimeout(() => progressWrap.classList.add('hidden'), 600);
}

/** Set the UI into scanning state. */
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

/** Stop the current SSE stream. */
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

// ─── Export ───────────────────────────────────────────────────────────────────

btnExport.addEventListener('click', () => {
  if (!currentDomain) return;

  fetch(`/api/results/${encodeURIComponent(currentDomain)}`)
    .then((r) => r.json())
    .then((data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${currentDomain}_results.json`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => termLine('err', '[!]', 'Failed to fetch report from server.'));
});

// ─── Form submit ──────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const domain = document.getElementById('domain').value.trim().toLowerCase();
  if (!domain) {
    document.getElementById('domain').focus();
    return;
  }

  // Stop any running scan
  if (evtSource) stopScan();

  // Reset state
  currentDomain = domain;
  allResults    = [];
  stats         = { total: 0, live: 0, cname: 0, crt: 0, fail: 0 };
  updateStats();
  termBody.innerHTML = '';
  resultsTbody.innerHTML = '';
  resultsSection.classList.add('hidden');
  exportWrap.classList.add('hidden');

  setScanningState(true);
  pulseProgress('Starting scan…');

  termLine('info', '[◈]', `Target: ${domain}`);
  termLine('info', '[◈]', `Threads: ${document.getElementById('threads').value}  Timeout: ${document.getElementById('timeout').value}ms`);

  // ── Start scan via API ──────────────────────────────────────────────────
  let scanId;
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain,
        threads:  parseInt(document.getElementById('threads').value,  10),
        timeout:  parseInt(document.getElementById('timeout').value,  10),
        skipCrt:  document.getElementById('skip-crt').checked,
        verbose:  document.getElementById('verbose').checked,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.scanId) throw new Error(json.error || 'Server error');
    scanId = json.scanId;
  } catch (err) {
    termLine('err', '[!]', `Failed to start scan: ${err.message}`);
    setScanningState(false);
    hideProgress();
    return;
  }

  // ── Subscribe to SSE stream ─────────────────────────────────────────────
  evtSource = new EventSource(`/api/stream/${scanId}`);

  evtSource.addEventListener('status', (e) => {
    const { msg } = JSON.parse(e.data);
    pulseProgress(msg);
    termLine('info', '[~]', msg);
  });

  evtSource.addEventListener('crt', (e) => {
    const { count } = JSON.parse(e.data);
    stats.crt = count;
    valCrt.textContent = count;
    termLine('info', '[crt]', `Found ${count} subdomains from certificate logs`);
  });

  evtSource.addEventListener('result', (e) => {
    const result = JSON.parse(e.data);
    allResults.push(result);
    stats.total++;

    if (result.type === 'A') {
      stats.live++;
      const addr = result.addresses[0] ?? '';
      termLine('live', '[+]', result.subdomain, addr, 'A');
    } else if (result.type === 'CNAME') {
      stats.cname++;
      const cname = result.addresses[0] ?? '';
      termLine('cname', '[+]', result.subdomain, cname, 'CNAME');
    } else {
      stats.fail++;
      termLine('failed', '[-]', result.subdomain, 'unresolvable');
    }

    updateStats();

    // Only add live records to table (or all if verbose)
    if (result.type !== 'none') {
      resultsSection.classList.remove('hidden');
      addTableRow(result);
    }
  });

  evtSource.addEventListener('done', (e) => {
    const meta = JSON.parse(e.data);
    termLine('done', '[✓]', `Done. ${meta.live} live / ${meta.unresolvable} failed / ${meta.total} total`);
    termLine('info', '[→]', `Report: output/${currentDomain}_results.json`);

    setScanningState(false);
    hideProgress();
    exportWrap.classList.remove('hidden');

    evtSource.close();
    evtSource = null;
  });

  evtSource.addEventListener('error', (e) => {
    try {
      const { msg } = JSON.parse(e.data);
      termLine('err', '[!]', msg);
    } catch {
      // SSE connection error
      if (evtSource?.readyState === EventSource.CLOSED) {
        termLine('err', '[!]', 'Connection to server lost.');
        setScanningState(false);
        hideProgress();
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
