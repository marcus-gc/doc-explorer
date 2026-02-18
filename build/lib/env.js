/**
 * Shared environment loading, file fetching, and concurrency helpers
 * for build scripts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root if present
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

export const LOCAL_REPO_ROOT = process.env.LOCAL_REPO_ROOT || null;
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;
export const GITHUB_OWNER = process.env.GITHUB_OWNER || 'givecampus';
export const GITHUB_REPO = process.env.GITHUB_REPO || 'givecampus';
export const GITHUB_REF = process.env.GITHUB_REF || 'staging';
export const DOCS_PATH = process.env.DOCS_PATH || 'docs';

const LANG_MAP = {
  '.rb': 'ruby',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.json': 'json',
  '.html': 'html',
  '.slim': 'slim',
  '.erb': 'erb',
  '.css': 'css',
  '.scss': 'scss',
};

export function detectLanguage(filePath) {
  const ext = path.extname(filePath);
  return LANG_MAP[ext] || 'text';
}

async function fetchWithRetry(url, headers, retries = 2) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (attempt < retries - 1) {
        console.warn(`  Retrying: ${err.message}`);
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        throw err;
      }
    }
  }
}

export async function fetchFileContent(filePath) {
  if (LOCAL_REPO_ROOT) {
    const absPath = path.resolve(LOCAL_REPO_ROOT, filePath);
    if (!fs.existsSync(absPath)) return null;
    return fs.readFileSync(absPath, 'utf-8');
  }

  if (!GITHUB_TOKEN) {
    console.error('Error: Set LOCAL_REPO_ROOT or GITHUB_TOKEN to fetch source files.');
    process.exit(1);
  }

  const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/${filePath}`;
  const headers = { Authorization: `token ${GITHUB_TOKEN}` };
  return fetchWithRetry(url, headers);
}

export async function fetchGitHubContents(dirPath) {
  if (!GITHUB_TOKEN) {
    console.error('Error: Set GITHUB_TOKEN for remote directory listing.');
    process.exit(1);
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${dirPath}?ref=${GITHUB_REF}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
  };

  const text = await fetchWithRetry(url, headers);
  if (!text) return [];
  return JSON.parse(text);
}

export async function mapWithConcurrency(items, fn, concurrency = 10) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
