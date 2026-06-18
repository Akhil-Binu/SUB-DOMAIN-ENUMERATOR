/**
 * @file resolver.js
 * @description DNS resolution logic. Resolves candidate subdomains using
 *              Node's built-in dns.promises with configurable concurrency,
 *              timeout, and retry logic. Supports both wordlist-driven
 *              brute-force and explicit candidate-list modes.
 */

import dns from 'dns/promises';
import { readFile } from 'fs/promises';
import pLimit from 'p-limit';

// Use well-known public resolvers for reliable lookups
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4', '1.0.0.1']);

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SubdomainResult
 * @property {string}   subdomain  - Fully-qualified subdomain (e.g. api.example.com)
 * @property {string[]} addresses  - Resolved IP addresses or CNAME target
 * @property {'A'|'CNAME'|'none'} type - Record type found
 * @property {'bruteforce'|'crt.sh'} source - How the candidate was discovered
 * @property {string}   timestamp  - ISO-8601 timestamp of the lookup
 */

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Attempt to resolve a single subdomain with a race against a timeout.
 * Tries A records first, falls back to CNAME.
 *
 * @param {string} subdomain   - Fully-qualified subdomain to resolve
 * @param {number} timeoutMs   - Maximum ms to wait for each DNS call
 * @param {number} retries     - Number of retry attempts on ETIMEOUT / ESERVFAIL
 * @returns {Promise<{addresses: string[], type: 'A'|'CNAME'|'none'}>}
 */
async function resolveSingle(subdomain, timeoutMs = 2000, retries = 2) {
  /**
   * Wrap a DNS promise in a race with a timeout reject.
   * @param {Promise<any>} promise
   * @returns {Promise<any>}
   */
  const withTimeout = (promise) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), timeoutMs)
      ),
    ]);

  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // ── Try A records first ────────────────────────────────────────────────
      const addrs = await withTimeout(dns.resolve4(subdomain));
      return { addresses: addrs, type: 'A' };
    } catch (errA) {
      // Non-retryable: domain definitively doesn't exist
      if (errA.code === 'ENOTFOUND' || errA.code === 'ENODATA' || errA.code === 'EREFUSED') {
        // Try CNAME before giving up entirely
        try {
          const cnames = await withTimeout(dns.resolveCname(subdomain));
          if (cnames.length > 0) {
            return { addresses: cnames, type: 'CNAME' };
          }
        } catch {
          // CNAME also failed — subdomain does not resolve
        }
        return { addresses: [], type: 'none' };
      }

      // Retryable errors: ETIMEOUT, ESERVFAIL, etc.
      lastErr = errA;
      if (attempt < retries) {
        // Brief back-off before retry
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }

  // All retries exhausted
  return { addresses: [], type: 'none' };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Load and deduplicate a newline-separated wordlist file.
 *
 * @param {string} filePath - Absolute or relative path to the wordlist
 * @returns {Promise<string[]>} Array of non-empty, trimmed words
 */
export async function loadWordlist(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const words = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  // Deduplicate in place
  return [...new Set(words)];
}

/**
 * Resolve a list of subdomains concurrently with a p-limit concurrency cap.
 * Supports two modes:
 *  - Wordlist mode: reads `wordlistPath` and prepends each word to `domain`
 *  - Candidate mode: resolves the explicit `candidates` array directly
 *
 * @param {Object}   options
 * @param {string}   options.domain        - Base domain (e.g. "example.com")
 * @param {string}   [options.wordlistPath] - Path to wordlist (wordlist mode)
 * @param {string[]} [options.candidates]   - Explicit FQDN list (candidate mode)
 * @param {number}   [options.concurrency=50] - Max concurrent DNS lookups
 * @param {number}   [options.timeoutMs=2000] - Per-lookup timeout in ms
 * @param {boolean}  [options.verbose=false]  - Log unresolvable entries
 * @param {'bruteforce'|'crt.sh'} [options.source='bruteforce'] - Discovery source tag
 * @param {(result: SubdomainResult) => void} [options.onResult] - Live result callback
 * @returns {Promise<SubdomainResult[]>} All results (resolved + unresolvable)
 */
export async function resolveSubdomains({
  domain,
  wordlistPath,
  candidates,
  concurrency = 50,
  timeoutMs = 2000,
  verbose = false,
  source = 'bruteforce',
  onResult,
}) {
  // Build the full FQDN list
  let fqdns;

  if (candidates && candidates.length > 0) {
    fqdns = candidates;
  } else {
    const words = await loadWordlist(wordlistPath);
    fqdns = words.map((w) => `${w}.${domain}`);
  }

  const limit = pLimit(concurrency);
  const results = [];
  const timestamp = () => new Date().toISOString();

  const tasks = fqdns.map((subdomain) =>
    limit(async () => {
      const { addresses, type } = await resolveSingle(subdomain, timeoutMs);

      /** @type {SubdomainResult} */
      const result = {
        subdomain,
        addresses,
        type,
        source,
        timestamp: timestamp(),
      };

      results.push(result);
      if (onResult) onResult(result);

      return result;
    })
  );

  await Promise.allSettled(tasks);
  return results;
}
