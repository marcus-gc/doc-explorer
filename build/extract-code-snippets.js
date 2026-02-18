#!/usr/bin/env node

/**
 * extract-code-snippets.js
 *
 * Reads the parsed pages JSON and fetches full source files for each
 * file reference in click directives. Files are fetched either from a local
 * clone (LOCAL_REPO_ROOT) or via the GitHub raw content API.
 *
 * Output: app/src/data/source-files.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  fetchFileContent,
  detectLanguage,
  mapWithConcurrency,
} from './lib/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PAGES_FILE = path.resolve(__dirname, '../app/src/data/pages.json');
const OUTPUT_FILE = path.resolve(__dirname, '../app/src/data/source-files.json');

async function main() {
  if (!fs.existsSync(PAGES_FILE)) {
    console.error('Pages JSON not found. Run fetch-docs.js first.');
    process.exit(1);
  }

  const { pages } = JSON.parse(fs.readFileSync(PAGES_FILE, 'utf-8'));

  // Collect all unique file paths across all pages
  const filePaths = new Set();

  for (const page of Object.values(pages)) {
    for (const section of page.sections) {
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
