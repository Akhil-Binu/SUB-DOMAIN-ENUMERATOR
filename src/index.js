#!/usr/bin/env node
/**
 * @file index.js
 * @description CLI entry point for subenum. Parses arguments via commander,
 *              orchestrates DNS brute-force and crt.sh enumeration, handles
 *              SIGINT for graceful partial-result saves.
 */

import { program } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubdomains } from './resolver.js';
import { fetchCrtSh } from './crtsh.js';
import { printBanner, printResult, printSummary, saveReport } from './reporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI definition ────────────────────────────────────────────────────────────

program
  .name('subenum')
  .description('Subdomain enumeration via DNS brute-force + Certificate Transparency logs')
  .version('1.0.0')
  .requiredOption('-d, --domain <domain>', 'Target domain (e.g. example.com)')
  .option('-w, --wordlist <path>', 'Path to wordlist file', path.join(__dirname, '..', 'wordlists', 'subdomains.txt'))
  .option('-t, --threads <number>', 'Concurrent DNS lookups', (v) => parseInt(v, 10), 50)
  .option('--timeout <ms>', 'DNS timeout in milliseconds', (v) => parseInt(v, 10), 2000)
  .option('-o, --output <dir>', 'Output directory for JSON reports', './output')
  .option('--no-crt', 'Skip certificate transparency (crt.sh) lookup')
  .option('--verbose', 'Show failed / unresolvable lookups');

program.parse();

const opts = program.opts();

// ─── Shared state ─────────────────────────────────────────────────────────────

/** @type {Array<import('./resolver.js').SubdomainResult>} */
const collectedResults = [];

// ─── SIGINT handler ───────────────────────────────────────────────────────────

process.on('SIGINT', async () => {
  console.log('\n\n[!] Interrupted — saving partial results…');
  if (collectedResults.length > 0) {
    await saveReport(collectedResults, opts.domain, opts.output).catch(() => {});
  }
  process.exit(0);
});

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Main orchestration function. Runs crt.sh lookup and DNS brute-force
 * concurrently where possible, then saves the final report.
 */
async function main() {
  printBanner(opts.domain);

  const domain = opts.domain.toLowerCase().trim();
  /** @type {Set<string>} merged, deduplicated candidate list */
  const candidates = new Set();

  // ── 1. crt.sh lookup ──────────────────────────────────────────────────────
  if (opts.crt) {
    try {
      const crtHosts = await fetchCrtSh(domain);
      console.log(`\n[crt.sh]  Found ${crtHosts.length} subdomains from certificate logs\n`);
      for (const h of crtHosts) candidates.add(h);
    } catch (err) {
      console.error(`[crt.sh]  Query failed: ${err.message}`);
    }
  } else {
    console.log('\n[crt.sh]  Skipped (--no-crt)\n');
  }

  // ── 2. Brute-force wordlist ────────────────────────────────────────────────
  const bruteResults = await resolveSubdomains({
    domain,
    wordlistPath: opts.wordlist,
    concurrency: opts.threads,
    timeoutMs: opts.timeout,
    verbose: opts.verbose,
    onResult: (result) => {
      // Stream results live to terminal as they come in
      if (result.type !== 'none' || opts.verbose) {
        printResult(result);
      }
      collectedResults.push(result);
    },
  });

  // ── 3. Resolve crt.sh-only candidates (not in wordlist) ──────────────────
  // Determine which crt.sh subdomains were NOT already covered by brute-force
  const resolvedNames = new Set(bruteResults.map((r) => r.subdomain));
  const crtOnly = [...candidates].filter((c) => !resolvedNames.has(c) && c.endsWith(`.${domain}`));

  if (crtOnly.length > 0) {
    console.log(`\n[crt.sh]  Resolving ${crtOnly.length} additional subdomains from CT logs…\n`);

    const crtResults = await resolveSubdomains({
      domain,
      candidates: crtOnly,   // pass explicit list instead of wordlist
      concurrency: opts.threads,
      timeoutMs: opts.timeout,
      verbose: opts.verbose,
      source: 'crt.sh',
      onResult: (result) => {
        if (result.type !== 'none' || opts.verbose) {
          printResult(result);
        }
        collectedResults.push(result);
      },
    });

    bruteResults.push(...crtResults);
  }

  // ── 4. Save report & print summary ────────────────────────────────────────
  const liveCount = collectedResults.filter((r) => r.type !== 'none').length;
  const outputPath = await saveReport(collectedResults, domain, opts.output);
  printSummary(collectedResults.length, liveCount, outputPath);
}

main().catch((err) => {
  console.error(`\n[!] Fatal error: ${err.message}`);
  process.exit(1);
});
