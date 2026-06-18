/**
 * @file reporter.js
 * @description Terminal output formatting with chalk color-coding and
 *              JSON report persistence to disk via fs/promises.
 */

import chalk from 'chalk';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// ─── Column widths for aligned output ─────────────────────────────────────────

const COL_SUBDOMAIN = 45;
const COL_ADDRESS = 25;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Left-pad a string to a fixed column width (truncates if too long).
 *
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function padEnd(str, width) {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Print the subenum ASCII banner to stdout.
 *
 * @param {string} domain - Target domain being enumerated
 */
export function printBanner(domain) {
  console.log(chalk.cyan('\n╔══════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.white('         subenum — Subdomain Enumerator           ') + chalk.cyan('║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════╝'));
  console.log(chalk.dim('  Target : ') + chalk.bold.yellow(domain));
  console.log(chalk.dim('  Time   : ') + chalk.dim(new Date().toLocaleString()));
  console.log('');
}

/**
 * Print a single resolved (or failed) subdomain result to stdout with
 * color coding:
 *  - Green  = A record resolved (IP address found)
 *  - Yellow = CNAME resolved (alias only)
 *  - Red    = Unresolvable
 *
 * @param {import('./resolver.js').SubdomainResult} result
 */
export function printResult(result) {
  const { subdomain, addresses, type } = result;
  const displayAddr = addresses.length > 0 ? addresses[0] : 'unresolvable';

  const paddedSub = padEnd(subdomain, COL_SUBDOMAIN);
  const paddedAddr = padEnd(displayAddr, COL_ADDRESS);

  if (type === 'A') {
    console.log(
      chalk.green('[+] ') +
        chalk.green(paddedSub) +
        chalk.dim('→ ') +
        chalk.bold.white(paddedAddr) +
        chalk.dim(` (${type})`)
    );
  } else if (type === 'CNAME') {
    console.log(
      chalk.yellow('[+] ') +
        chalk.yellow(paddedSub) +
        chalk.dim('→ ') +
        chalk.bold.white(paddedAddr) +
        chalk.dim(` (${type})`)
    );
  } else {
    console.log(
      chalk.red('[-] ') +
        chalk.dim(paddedSub) +
        chalk.dim('→ ') +
        chalk.dim(paddedAddr)
    );
  }
}

/**
 * Print the final summary line to stdout.
 *
 * @param {number} total      - Total candidates attempted
 * @param {number} live       - Subdomains with at least one resolved address
 * @param {string} outputPath - Absolute path to the saved JSON report
 */
export function printSummary(total, live, outputPath) {
  const dead = total - live;
  console.log('');
  console.log(chalk.cyan('─'.repeat(60)));
  console.log(
    chalk.bold.green('[✓] Done. ') +
      chalk.bold.white(`${live}`) +
      chalk.white(' live') +
      chalk.dim(` / ${dead} unresolvable`) +
      chalk.dim(` / ${total} total`)
  );
  console.log(chalk.dim('    Report → ') + chalk.underline.cyan(outputPath));
  console.log('');
}

/**
 * Serialise all results to a JSON file inside `outputDir`.
 * The output directory is created recursively if it does not exist.
 * Filename format: `{domain}_results.json`
 *
 * @param {import('./resolver.js').SubdomainResult[]} results - All collected results
 * @param {string} domain     - Target domain (used for filename)
 * @param {string} outputDir  - Directory to write the file into
 * @returns {Promise<string>} Absolute path of the written file
 */
export async function saveReport(results, domain, outputDir) {
  // Resolve output path relative to CWD
  const absOutputDir = path.resolve(outputDir);
  await mkdir(absOutputDir, { recursive: true });

  const filename = `${domain}_results.json`;
  const filePath = path.join(absOutputDir, filename);

  const report = {
    meta: {
      domain,
      generatedAt: new Date().toISOString(),
      totalCandidates: results.length,
      liveCount: results.filter((r) => r.type !== 'none').length,
      aRecords: results.filter((r) => r.type === 'A').length,
      cnameRecords: results.filter((r) => r.type === 'CNAME').length,
      unresolvable: results.filter((r) => r.type === 'none').length,
    },
    results: results.map((r) => ({
      subdomain: r.subdomain,
      addresses: r.addresses,
      type: r.type,
      source: r.source,
      timestamp: r.timestamp,
    })),
  };

  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
  return filePath;
}
