/**
 * @file validate.js
 * @description Shared validation for values that cross a trust boundary
 *              (CLI args, HTTP query/body params) before they reach DNS
 *              lookups or get used as filesystem path components.
 */

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/**
 * Validate that a string is a well-formed hostname — letters, digits,
 * hyphens and dots only, no leading/trailing hyphens per label, no empty
 * labels (so no ".."), no path separators or whitespace. This is what
 * keeps `domain` safe to interpolate into a filename such as
 * `{domain}_results.json` without risking path traversal.
 *
 * @param {string} domain
 * @returns {boolean}
 */
export function isValidDomain(domain) {
  return typeof domain === 'string' && domain.length > 0 && domain.length <= 253 && DOMAIN_RE.test(domain);
}

/**
 * Parse an integer and clamp it to [min, max], falling back to a default
 * when the input is missing, non-numeric, or otherwise not finite.
 *
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
export function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
