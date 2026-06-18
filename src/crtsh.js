/**
 * @file crtsh.js
 * @description Queries the crt.sh Certificate Transparency log aggregator to
 *              discover historical subdomains. Handles wildcards, deduplication,
 *              rate-limit (HTTP 429) errors, and fetch timeouts via AbortController.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const CRT_SH_BASE = 'https://crt.sh';
const DEFAULT_TIMEOUT_MS = 15_000; // crt.sh can be slow
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Sleep for a given number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Strip wildcard prefix and return clean hostname.
 * e.g. "*.example.com" → "example.com", "api.example.com" → "api.example.com"
 *
 * @param {string} name - Raw name_value from crt.sh JSON
 * @returns {string}
 */
function stripWildcard(name) {
  return name.startsWith('*.') ? name.slice(2) : name;
}

/**
 * Normalise a raw name_value which may contain multiple hostnames
 * separated by newlines (crt.sh quirk). Returns an array of clean names.
 *
 * @param {string} nameValue
 * @returns {string[]}
 */
function parseNameValue(nameValue) {
  return nameValue
    .split('\n')
    .map((n) => stripWildcard(n.trim().toLowerCase()))
    .filter((n) => n.length > 0 && n.includes('.'));
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Query crt.sh for all subdomains of `domain` recorded in Certificate
 * Transparency logs. Results are deduplicated and returned as a sorted array.
 *
 * Retries up to MAX_RETRIES times on HTTP 429 (rate-limit) or network errors,
 * with exponential-ish back-off.
 *
 * @param {string} domain - Base domain to search (e.g. "example.com")
 * @param {number} [timeoutMs=15000] - Fetch timeout in milliseconds
 * @returns {Promise<string[]>} Unique subdomain FQDNs discovered
 * @throws {Error} If all retry attempts fail or the response is malformed
 */
export async function fetchCrtSh(domain, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const url = `${CRT_SH_BASE}/?q=%25.${encodeURIComponent(domain)}&output=json`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Identify ourselves politely
          'User-Agent': 'subenum/1.0 (subdomain-enumeration-tool)',
          Accept: 'application/json',
        },
      });

      clearTimeout(timer);

      // ── Rate-limit handling ────────────────────────────────────────────────
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '0', 10);
        const wait = retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAY_MS * attempt;
        console.error(`[crt.sh]  Rate-limited (429). Waiting ${wait / 1000}s before retry ${attempt}/${MAX_RETRIES}…`);
        await sleep(wait);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      // ── Parse JSON ────────────────────────────────────────────────────────
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('crt.sh returned non-JSON response (service may be down)');
      }

      if (!Array.isArray(data)) {
        // crt.sh returns an empty body (not JSON array) when no results found
        return [];
      }

      // ── Extract, clean, deduplicate ───────────────────────────────────────
      const seen = new Set();
      for (const entry of data) {
        if (typeof entry?.name_value === 'string') {
          for (const name of parseNameValue(entry.name_value)) {
            // Only keep entries that are actually subdomains of the target
            if (name.endsWith(`.${domain}`) || name === domain) {
              seen.add(name);
            }
          }
        }
      }

      return [...seen].sort();
    } catch (err) {
      clearTimeout(timer);

      if (err.name === 'AbortError') {
        if (attempt < MAX_RETRIES) {
          console.error(`[crt.sh]  Timeout on attempt ${attempt}/${MAX_RETRIES}. Retrying…`);
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error(`crt.sh query timed out after ${attempt} attempts`);
      }

      // Network / other errors
      if (attempt < MAX_RETRIES) {
        console.error(`[crt.sh]  Error on attempt ${attempt}/${MAX_RETRIES}: ${err.message}. Retrying…`);
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      throw err;
    }
  }

  // Should never reach here, but satisfy the linter
  return [];
}
