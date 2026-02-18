#!/usr/bin/env node

/**
 * fetch-docs.js
 *
 * Discovers markdown files in the target repo's docs directory,
 * fetches their content, parses frontmatter + mermaid diagrams,
 * and builds a page map with nav tree.
 *
 * Output: app/src/data/pages.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import {
  LOCAL_REPO_ROOT,
  DOCS_PATH,
  fetchFileContent,
  fetchGitHubContents,
} from './lib/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, '../app/src/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'pages.json');

// --- Markdown parsing (reused from parse-workflows.js) ---

const MERMAID_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/g;
const CLICK_RE = /click\s+(\S+)\s+href\s+"#"\s+"([^"]+)"/g;

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateDiagramId(content, diagramIndex, offset) {
  let lastHeading = null;
  let match;
  const headingRe = /^(#{1,6})\s+(.+)$/gm;

  while ((match = headingRe.exec(content)) !== null) {
    if (match.index < offset) {
      lastHeading = match[2];
    } else {
      break;
    }
  }

  if (lastHeading) {
    return slugify(lastHeading);
  }
  return `diagram-${diagramIndex}`;
}

function extractParticipantMap(mermaidCode) {
  const map = {};
  const participantRe = /participant\s+(\S+)\s+as\s+(.+?)$/gm;
  let match;
  while ((match = participantRe.exec(mermaidCode)) !== null) {
    const alias = match[1];
    const displayName = match[2].trim().replace(/<br\/?>\s*/gi, ' ');
    map[alias] = displayName;
  }
  return map;
}

function extractClickDirectives(mermaidCode) {
  const nodeFiles = {};
  let match;
  const clickRe = new RegExp(CLICK_RE.source, 'g');

  while ((match = clickRe.exec(mermaidCode)) !== null) {
    const nodeId = match[1];
    const fileRef = match[2];

    const lineMatch = fileRef.match(/^(.+?):(\d+)-(\d+)$/);
    if (lineMatch) {
      nodeFiles[nodeId] = {
        file: lineMatch[1],
        startLine: parseInt(lineMatch[2], 10),
        endLine: parseInt(lineMatch[3], 10),
      };
    } else {
      nodeFiles[nodeId] = {
        file: fileRef,
        startLine: null,
        endLine: null,
      };
    }
  }

  return nodeFiles;
}

function stripClickDirectives(mermaidCode) {
  return mermaidCode
    .split('\n')
    .filter((line) => !line.trim().match(/^click\s+\S+\s+href\s+"#"/))
    .join('\n');
}

function parseMarkdownContent(content) {
  const { data: frontmatter, content: body } = matter(content);

  if (!frontmatter.title) {
    const h1Match = body.match(/^#\s+(.+)$/m);
    frontmatter.title = h1Match ? h1Match[1] : 'Untitled';
  }

  if (!frontmatter.description) {
    frontmatter.description = '';
  }

  if (!frontmatter.tags) {
    frontmatter.tags = [];
  }

  const sections = [];
  let lastIndex = 0;
  let diagramIndex = 0;
  const mermaidRe = new RegExp(MERMAID_FENCE_RE.source, 'g');
  let mermaidMatch;

  while ((mermaidMatch = mermaidRe.exec(body)) !== null) {
    const proseBefore = body.slice(lastIndex, mermaidMatch.index).trim();
    if (proseBefore) {
      sections.push({ type: 'prose', content: proseBefore });
    }

    const mermaidCode = mermaidMatch[1];
    const id = generateDiagramId(body, diagramIndex, mermaidMatch.index);
    const nodeFiles = extractClickDirectives(mermaidCode);
    const participantMap = extractParticipantMap(mermaidCode);
    const cleanDefinition = stripClickDirectives(mermaidCode);

    const section = {
      type: 'mermaid',
      id,
      definition: cleanDefinition.trim(),
      nodeFiles,
    };

    if (Object.keys(participantMap).length > 0) {
      section.participantMap = participantMap;
    }

    sections.push(section);

    lastIndex = mermaidMatch.index + mermaidMatch[0].length;
    diagramIndex++;
  }

  const remaining = body.slice(lastIndex).trim();
  if (remaining) {
    sections.push({ type: 'prose', content: remaining });
  }

  return { frontmatter, sections };
}

// --- File discovery ---

const IGNORED_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', 'vendor']);

async function discoverLocalFiles(docsDir) {
  const results = [];

  function walk(dir, prefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), relPath);
      } else if (entry.name.endsWith('.md')) {
        results.push(relPath);
      }
    }
  }

  walk(docsDir, '');
  return results;
}

async function discoverRemoteFiles(docsPath) {
  const results = [];

  async function walk(dirPath) {
    const entries = await fetchGitHubContents(dirPath);
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      if (entry.type === 'dir') {
        await walk(entry.path);
      } else if (entry.name.endsWith('.md')) {
        const relPath = entry.path.slice(docsPath.length + 1);
        results.push(relPath);
      }
    }
  }

  await walk(docsPath);
  return results;
}

// --- Route derivation ---

function fileToRoute(relativePath) {
  // Remove .md extension
  let route = relativePath.replace(/\.md$/, '');

  // index files map to their parent directory
  if (route.endsWith('/index') || route === 'index') {
    route = route.replace(/\/?index$/, '');
  }

  // Ensure leading slash, handle root
  route = '/' + route;
  if (route === '/') return '/';

  return route;
}

// --- Nav tree building ---

function buildNavTree(pages) {
  const pageMap = pages;
  const roots = [];

  // Sort routes so parents come before children
  const routes = Object.keys(pageMap).sort();

  for (const route of routes) {
    const page = pageMap[route];
    const node = {
      route: page.route,
      title: page.title,
      children: [],
    };

    if (page.parentRoute && pageMap[page.parentRoute]) {
      // Find parent in tree (recursively)
      const parentNode = findNode(roots, page.parentRoute);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function findNode(nodes, route) {
  for (const node of nodes) {
    if (node.route === route) return node;
    const found = findNode(node.children, route);
    if (found) return found;
  }
  return null;
}

// --- Main ---

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Discover markdown files
  let relativeFiles;

  if (LOCAL_REPO_ROOT) {
    const docsDir = path.resolve(LOCAL_REPO_ROOT, DOCS_PATH);
    if (!fs.existsSync(docsDir)) {
      console.error(`Docs directory not found: ${docsDir}`);
      process.exit(1);
    }
    console.log(`Discovering docs in ${docsDir}`);
    relativeFiles = await discoverLocalFiles(docsDir);
  } else {
    console.log(`Discovering docs via GitHub API: ${DOCS_PATH}/`);
    relativeFiles = await discoverRemoteFiles(DOCS_PATH);
  }

  relativeFiles.sort();
  console.log(`Found ${relativeFiles.length} markdown files\n`);

  if (relativeFiles.length === 0) {
    console.warn('No markdown files found.');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ pages: {}, navTree: [] }, null, 2));
    return;
  }

  // Fetch and parse each file
  const pages = {};

  for (const relFile of relativeFiles) {
    const fullPath = `${DOCS_PATH}/${relFile}`;
    console.log(`  Fetching: ${fullPath}`);

    const content = await fetchFileContent(fullPath);
    if (!content) {
      console.warn(`  MISSING: ${fullPath}`);
      continue;
    }

    const { frontmatter, sections } = parseMarkdownContent(content);
    const route = fileToRoute(relFile);
    const isIndex = relFile.endsWith('index.md');

    // Derive parent route
    let parentRoute = null;
    if (route !== '/') {
      const parentPath = route.substring(0, route.lastIndexOf('/')) || '/';
      // Only set parentRoute if the parent page actually exists or will exist
      parentRoute = parentPath === '/' && !relativeFiles.some((f) => f === 'index.md')
        ? null
        : parentPath;
    }

    pages[route] = {
      route,
      title: frontmatter.title,
      description: frontmatter.description,
      tags: frontmatter.tags,
      isIndex,
      parentRoute,
      sourcePath: fullPath,
      sections,
    };
  }

  // Synthesize index pages for directories that have children but no index.md
  const parentRoutes = new Set();
  for (const page of Object.values(pages)) {
    if (page.parentRoute) {
      parentRoutes.add(page.parentRoute);
    }
  }

  for (const parentRoute of parentRoutes) {
    if (!pages[parentRoute]) {
      const dirName = parentRoute === '/'
        ? 'Home'
        : parentRoute.split('/').filter(Boolean).pop().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      // Derive this synthetic page's own parent
      let grandparentRoute = null;
      if (parentRoute !== '/') {
        grandparentRoute = parentRoute.substring(0, parentRoute.lastIndexOf('/')) || '/';
      }

      pages[parentRoute] = {
        route: parentRoute,
        title: dirName,
        description: '',
        tags: [],
        isIndex: true,
        parentRoute: grandparentRoute,
        sourcePath: null,
        sections: [],
      };
      console.log(`  Synthesized index page: ${parentRoute} ("${dirName}")`);
    }
  }

  // Repeat: synthesize any newly needed grandparent pages
  const newParentRoutes = new Set();
  for (const page of Object.values(pages)) {
    if (page.parentRoute && !pages[page.parentRoute]) {
      newParentRoutes.add(page.parentRoute);
    }
  }
  for (const parentRoute of newParentRoutes) {
    if (!pages[parentRoute]) {
      const dirName = parentRoute === '/'
        ? 'Home'
        : parentRoute.split('/').filter(Boolean).pop().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      pages[parentRoute] = {
        route: parentRoute,
        title: dirName,
        description: '',
        tags: [],
        isIndex: true,
        parentRoute: null,
        sourcePath: null,
        sections: [],
      };
      console.log(`  Synthesized index page: ${parentRoute} ("${dirName}")`);
    }
  }

  // Fix parentRoute references: only keep if parent page exists
  for (const page of Object.values(pages)) {
    if (page.parentRoute && !pages[page.parentRoute]) {
      page.parentRoute = null;
    }
  }

  const navTree = buildNavTree(pages);

  const output = { pages, navTree };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${Object.keys(pages).length} pages to ${OUTPUT_FILE}`);
}

main();
