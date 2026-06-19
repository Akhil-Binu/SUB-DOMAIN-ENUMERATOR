/**
 * @file api/results/[domain].js
 * @description Vercel serverless function — GET /api/results/:domain
 * Reads the saved JSON report from /tmp and returns it.
 */

import { readFile } from 'fs/promises';
import path from 'path';

const TMP_OUTPUT = '/tmp/subenum-output';

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse}  res
 */
export default async function handler(req, res) {
  const domain = req.query?.domain ?? req.url?.split('/').pop();

  if (!domain) {
    res.status(400).json({ error: 'domain is required' });
    return;
  }

  try {
    const filePath = path.join(TMP_OUTPUT, `${domain}_results.json`);
    const content  = await readFile(filePath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(content);
  } catch {
    res.status(404).json({ error: `No report found for domain: ${domain}` });
  }
}
