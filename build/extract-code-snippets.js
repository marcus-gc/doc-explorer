#!/usr/bin/env node

/**
 * extract-code-snippets.js
 *
 * Reads the parsed workflows JSON and fetches full source files for each
 * file reference in click directives. Files are fetched either from a local
 * clone (LOCAL_REPO_ROOT) or via the GitHub raw content API.
 *
 * Output: app/src/data/source-files.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root if present
const envPath = path.resolve(__dirname, '../.env');
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

const WORKFLOWS_FILE = path.resolve(__dirname, '../app/src/data/workflows.json');
const OUTPUT_FILE = path.resolve(__dirname, '../app/src/data/source-files.json');

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

function detectLanguage(filePath) {
  const ext = path.extname(filePath);
  return LANG_MAP[ext] || 'text';
}

// --- File fetching ---

const LOCAL_REPO_ROOT = process.env.LOCAL_REPO_ROOT || null;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'givecampus';
const GITHUB_REPO = process.env.GITHUB_REPO || 'givecampus';
const GITHUB_REF = process.env.GITHUB_REF || 'staging';

async function fetchFileContent(filePath) {
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

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${filePath}`);
      return await res.text();
    } catch (err) {
      if (attempt === 0) {
        console.warn(`  Retrying ${filePath}: ${err.message}`);
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        throw err;
      }
    }
  }
}

// --- Concurrency helper ---

async function mapWithConcurrency(items, fn, concurrency = 10) {
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

// --- Main ---

async function main() {
  if (!fs.existsSync(WORKFLOWS_FILE)) {
    console.error('Workflows JSON not found. Run parse-workflows.js first.');
    process.exit(1);
  }

  const workflows = JSON.parse(fs.readFileSync(WORKFLOWS_FILE, 'utf-8'));

  // Collect all unique file paths across all workflows
  const filePaths = new Set();

  for (const workflow of workflows) {
    for (const section of workflow.sections) {
      if (section.type !== 'mermaid') continue;
      for (const [nodeId, ref] of Object.entries(section.nodeFiles)) {
        filePaths.add(ref.file);
      }
    }
  }

  const uniqueFiles = [...filePaths];
  console.log(`Found ${uniqueFiles.length} unique source files referenced`);

  const sourceFiles = {};

  await mapWithConcurrency(
    uniqueFiles,
    async (filePath) => {
      const content = await fetchFileContent(filePath);

      if (content === null) {
        console.warn(`  MISSING: ${filePath}`);
        sourceFiles[filePath] = {
          language: detectLanguage(filePath),
          error: 'File not found',
        };
        return;
      }

      const lines = content.split('\n');
      const language = detectLanguage(filePath);

      sourceFiles[filePath] = {
        language,
        totalLines: lines.length,
        content,
      };

      console.log(`  ${filePath} (${language}, ${lines.length} lines)`);
    },
    10
  );

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sourceFiles, null, 2));
  console.log(`\nWrote ${uniqueFiles.length} source files to ${OUTPUT_FILE}`);
}

main();
