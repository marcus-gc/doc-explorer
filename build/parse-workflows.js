#!/usr/bin/env node

/**
 * parse-workflows.js
 *
 * Parses Markdown files from /docs/workflows/ into structured JSON.
 * Output is written to /docs/app/src/data/workflows.json
 *
 * Each markdown file becomes a workflow object with:
 *   - slug (from filename)
 *   - frontmatter (title, description, tags)
 *   - sections[] (prose and mermaid blocks in document order)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKFLOWS_DIR = path.resolve(__dirname, '../workflows');
const OUTPUT_DIR = path.resolve(__dirname, '../app/src/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'workflows.json');

// Regex to match mermaid code fences
const MERMAID_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/g;

// Regex to extract click directives:  click <ID> href "#" "<filepath>"
const CLICK_RE = /click\s+(\S+)\s+href\s+"#"\s+"([^"]+)"/g;

// Regex to find the nearest heading before a position
const HEADING_RE = /^(#{1,6})\s+(.+)$/gm;

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateDiagramId(content, diagramIndex, offset) {
  // Find the nearest heading before this mermaid block
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
    // Collapse <br/> tags into spaces for display name matching
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

    // Parse optional line range: "path/to/file.rb:15-32"
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
  // Remove click directive lines so Mermaid doesn't try to handle them
  return mermaidCode
    .split('\n')
    .filter((line) => !line.trim().match(/^click\s+\S+\s+href\s+"#"/))
    .join('\n');
}

function parseWorkflow(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const slug = path.basename(filePath, '.md');

  // Parse frontmatter
  const { data: frontmatter, content } = matter(raw);

  // If no frontmatter title, derive from first H1 or filename
  if (!frontmatter.title) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    frontmatter.title = h1Match
      ? h1Match[1]
      : slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (!frontmatter.description) {
    frontmatter.description = '';
  }

  if (!frontmatter.tags) {
    frontmatter.tags = [];
  }

  // Split content into prose and mermaid sections
  const sections = [];
  let lastIndex = 0;
  let diagramIndex = 0;
  const mermaidRe = new RegExp(MERMAID_FENCE_RE.source, 'g');
  let mermaidMatch;

  while ((mermaidMatch = mermaidRe.exec(content)) !== null) {
    // Add prose section before this mermaid block
    const proseBefore = content.slice(lastIndex, mermaidMatch.index).trim();
    if (proseBefore) {
      sections.push({
        type: 'prose',
        content: proseBefore,
      });
    }

    const mermaidCode = mermaidMatch[1];
    const id = generateDiagramId(content, diagramIndex, mermaidMatch.index);
    const nodeFiles = extractClickDirectives(mermaidCode);
    const participantMap = extractParticipantMap(mermaidCode);
    const cleanDefinition = stripClickDirectives(mermaidCode);

    const section = {
      type: 'mermaid',
      id,
      definition: cleanDefinition.trim(),
      nodeFiles,
    };

    // Only include participantMap if it has entries (sequence diagrams)
    if (Object.keys(participantMap).length > 0) {
      section.participantMap = participantMap;
    }

    sections.push(section);

    lastIndex = mermaidMatch.index + mermaidMatch[0].length;
    diagramIndex++;
  }

  // Add remaining prose after last mermaid block
  const remaining = content.slice(lastIndex).trim();
  if (remaining) {
    sections.push({
      type: 'prose',
      content: remaining,
    });
  }

  return {
    slug,
    frontmatter,
    sections,
  };
}

function main() {
  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Find all markdown files
  const files = fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  if (files.length === 0) {
    console.warn('No markdown files found in', WORKFLOWS_DIR);
    fs.writeFileSync(OUTPUT_FILE, '[]');
    return;
  }

  const workflows = files.map((f) => {
    const filePath = path.join(WORKFLOWS_DIR, f);
    console.log(`  Parsing: ${f}`);
    return parseWorkflow(filePath);
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(workflows, null, 2));
  console.log(`\nWrote ${workflows.length} workflows to ${OUTPUT_FILE}`);
}

main();
