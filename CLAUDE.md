# Outreach Docs — Project Guide

## What this project is

A standalone React+Vite documentation site that visualizes the GiveCampus outreach system. It renders interactive Mermaid diagrams (flowcharts and sequence diagrams) where clicking a node opens a popover showing the actual source code from the main `givecampus/givecampus` Rails monolith.

This was extracted from `docs/` inside the monolith so it can be developed independently.

## How the build pipeline works

There are two build steps that run before the Vite dev server. Both are Node scripts in `build/`.

### Step 1: `parse-workflows.js`

Reads the 7 markdown files in `workflows/`. Each file documents one outreach workflow and contains:
- YAML frontmatter (title, description, tags)
- Prose sections (markdown)
- Mermaid code fences with `click` directives linking diagram nodes to source files

The parser splits each markdown file into ordered sections (`prose` or `mermaid`), extracts click directives into a `nodeFiles` map (node ID -> file path + optional line range), and writes `app/src/data/workflows.json`.

### Step 2: `extract-code-snippets.js`

Reads `workflows.json`, collects every unique source file path referenced by click directives (~76 files), and fetches the **full content** of each file. Two modes:

- **Local mode** (`LOCAL_REPO_ROOT` env var): reads files from a local clone of the monolith
- **Remote mode** (`GITHUB_TOKEN` env var): fetches via `https://raw.githubusercontent.com/`

Outputs `app/src/data/source-files.json` — a map of file path to `{ language, totalLines, content }`.

The `.env` file at the project root configures which mode to use. It's loaded by the script itself (no dotenv dependency).

### Generated data files

Both JSON files in `app/src/data/` are gitignored and rebuilt on every `npm run dev` or `npm run build`. Use `npm run dev:cached` to skip rebuilding and start Vite with whatever JSON is already on disk.

## How the frontend works

### Component tree

```
App.jsx                    Routes + header with settings dropdown
├── WorkflowIndex.jsx      Homepage listing all 7 workflow cards
└── WorkflowPage.jsx       Single workflow document
    ├── MarkdownRenderer   Renders prose sections (react-markdown + GFM)
    └── MermaidDiagram     Renders mermaid SVG, attaches click handlers
        └── NodePopover    Floating popover with source code preview
            └── CodeBlock  Syntax-highlighted code with line numbers
```

### Key data flow

1. `WorkflowPage` imports `source-files.json` and passes it as `sourceFiles` prop to `MermaidDiagram`
2. `MermaidDiagram` renders the mermaid definition into SVG, then walks `nodeFiles` to find each node element in the SVG and attaches click handlers
3. On click, `NodePopover` receives the file ref (path + optional startLine/endLine) and extracts the relevant lines from the full file content at render time using `useMemo`
4. `CodeBlock` does per-line syntax highlighting with highlight.js, dimming context lines and highlighting focus lines

### Line-range extraction (runtime)

The click directives in mermaid diagrams specify optional line ranges like `app/controllers/foo.rb:29-49`. The build step stores the **entire file**. `NodePopover` extracts the snippet at render time with 2 lines of context above/below. Full-file references (no line range) are truncated at 100 lines in the UI.

### Editor links

The settings dropdown (gear icon) lets users pick an editor and set their local repo path. The repo path is stored in `localStorage` under `docs-repo-path` and used to build `vscode://`, `cursor://`, etc. URLs in the popover header. If no path is set, the file path displays as plain text (no link).

## Project structure

```
workflows/              7 markdown source files (the "content")
build/
  parse-workflows.js    Markdown -> workflows.json
  extract-code-snippets.js  Fetches source files -> source-files.json
  package.json          Only dependency: gray-matter
app/
  src/
    App.jsx             Router + EditorSelector with repo path input
    components/         All UI components
    data/               Generated JSON (gitignored)
    styles/theme.css    Full design system (warm editorial palette)
  package.json          React, Vite, Mermaid, highlight.js, etc.
  vite.config.js        Vite config (port 3100, no special defines)
  index.html            Entry HTML with Google Fonts
.env.example            Template for env config
.env                    Local env config (gitignored)
```

## Commands

All commands run from `app/`:

```bash
npm run dev          # parse + extract + vite dev server
npm run dev:cached   # vite dev server only (skip rebuild)
npm run build        # parse + extract + vite production build
npm run parse        # just run the two build scripts
```

## Design decisions

- **Full files in JSON, line extraction at runtime**: Simpler build script, and opens the door to richer browsing (scroll through the file, jump to different ranges) without re-running the build.
- **No bundled env loader**: The extract script has a tiny inline `.env` parser (~10 lines) to avoid adding a dependency.
- **Two separate `package.json` files**: `build/` only needs `gray-matter`. `app/` has the full React/Vite stack. Keeps build tool deps minimal.
- **Mermaid node matching uses 5 strategies**: Flowchart nodes, direct ID, data-id, participant text matching (for sequence diagrams), and broad ID-contains fallback. This handles Mermaid's inconsistent ID generation across diagram types.

## Workflow markdown format

Each workflow file in `workflows/` follows this structure:

```markdown
---
title: Creating an Outreach
description: ...
tags: [outreach, controllers]
---

## Overview
Prose explaining the workflow...

## Flowchart
```mermaid
flowchart TD
  A[Step 1] --> B[Step 2]
  click A href "#" "app/controllers/foo.rb:15-30"
  click B href "#" "app/services/bar.rb"
`` `

## Sequence Diagram
...more sections...
```

The `click` directives are the bridge between diagrams and source code. Format: `click <NodeID> href "#" "<filepath>:<startLine>-<endLine>"`. The `href "#"` is a no-op anchor — the app intercepts clicks via JS event handlers instead.
