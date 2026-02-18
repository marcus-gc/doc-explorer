# Doc Viewer — Project Guide

## What this project is

A repo-agnostic React+Vite documentation viewer. It renders interactive Mermaid diagrams (flowcharts and sequence diagrams) where clicking a node opens a popover showing actual source code from a target repository.

The viewer has **no content of its own**. Markdown files live in the target repo (e.g. `givecampus/givecampus`) under a configurable `DOCS_PATH` directory. The build step discovers those files, fetches and parses them, and the React frontend renders them with file-system routing.

## How the build pipeline works

There are two build steps that run before the Vite dev server. Both are Node scripts in `build/`.

### Step 1: `fetch-docs.js`

Discovers markdown files in the target repo's docs directory, fetches their content, parses each one, and builds a page map + nav tree. Two discovery modes:

- **Local mode** (`LOCAL_REPO_ROOT` env var): recursive `fs.readdirSync` on `{LOCAL_REPO_ROOT}/{DOCS_PATH}`
- **Remote mode** (`GITHUB_TOKEN` env var): GitHub Contents API recursively, then `raw.githubusercontent.com` for file content

Each markdown file is parsed for:
- YAML frontmatter (title, description, tags)
- Prose sections (markdown)
- Mermaid code fences with `click` directives linking diagram nodes to source files

Routes are derived from file paths (file-system routing):
- `docs/outreach/index.md` → `/outreach`
- `docs/outreach/workflows/foo.md` → `/outreach/workflows/foo`
- `docs/index.md` → `/`

Outputs `app/src/data/pages.json` containing `{ pages, navTree }`.

### Step 2: `extract-code-snippets.js`

Reads `pages.json`, collects every unique source file path referenced by click directives, and fetches the **full content** of each file.

Outputs `app/src/data/source-files.json` — a map of file path to `{ language, totalLines, content }`.

### Shared utilities: `lib/env.js`

Both scripts use `build/lib/env.js` for env loading, file fetching, and concurrency helpers. The `.env` file at the project root configures which mode to use. No dotenv dependency — a tiny inline parser loads `.env`.

### Generated data files

Both JSON files in `app/src/data/` are gitignored and rebuilt on every `npm run dev` or `npm run build`. Use `npm run dev:cached` to skip rebuilding and start Vite with whatever JSON is already on disk.

## How the frontend works

### Component tree

```
App.jsx                    Routes + header with settings dropdown
└── DocPage.jsx            Unified page renderer (index + leaf pages)
    ├── Breadcrumb         Route-based breadcrumb navigation
    ├── MarkdownRenderer   Renders prose sections (react-markdown + GFM)
    ├── MermaidDiagram     Renders mermaid SVG, attaches click handlers
    │   └── NodePopover    Floating popover with source code preview
    │       └── CodeBlock  Syntax-highlighted code with line numbers
    └── (child cards)      Index pages show cards linking to child pages
```

### Key data flow

1. `App` imports `pages.json` and passes `pages` and `navTree` to `DocPage`
2. `DocPage` reads the current route from `useLocation()`, looks up the page, renders breadcrumbs + title + sections + child cards (if index page)
3. `DocPage` imports `source-files.json` and passes it to `MermaidDiagram`
4. `MermaidDiagram` renders the mermaid definition into SVG, walks `nodeFiles` to attach click handlers
5. On click, `NodePopover` extracts the relevant lines from full file content at render time using `useMemo`
6. `CodeBlock` does per-line syntax highlighting with highlight.js

### Line-range extraction (runtime)

The click directives specify optional line ranges like `app/controllers/foo.rb:29-49`. The build step stores the **entire file**. `NodePopover` extracts the snippet at render time with 2 lines of context above/below. Full-file references (no line range) are truncated at 100 lines in the UI.

### Editor links

The settings dropdown (gear icon) lets users pick an editor and set their local repo path. The repo path is stored in `localStorage` under `docs-repo-path` and used to build `vscode://`, `cursor://`, etc. URLs in the popover header.

## Project structure

```
build/
  fetch-docs.js             Discovers + fetches + parses docs → pages.json
  extract-code-snippets.js  Fetches source files → source-files.json
  lib/env.js                Shared env loading, fetch helpers, concurrency
  package.json              Only dependency: gray-matter
app/
  src/
    App.jsx                 Router + EditorSelector with repo path input
    components/
      DocPage.jsx           Unified page renderer (handles all routes)
      Breadcrumb.jsx        Breadcrumb navigation
      MermaidDiagram.jsx    Mermaid SVG rendering + click handlers
      NodePopover.jsx       Source code popover
      CodeBlock.jsx         Syntax-highlighted code display
      MarkdownRenderer.jsx  Prose section rendering
    data/                   Generated JSON (gitignored)
    styles/theme.css        Full design system (warm editorial palette)
  package.json              React, Vite, Mermaid, highlight.js, etc.
  vite.config.js            Vite config (port 3100)
  index.html                Entry HTML with Google Fonts
.env.example                Template for env config
.env                        Local env config (gitignored)
```

## Commands

All commands run from `app/`:

```bash
npm run dev          # fetch-docs + extract + vite dev server
npm run dev:cached   # vite dev server only (skip rebuild)
npm run build        # fetch-docs + extract + vite production build
npm run parse        # just run the two build scripts
```

## Design decisions

- **Repo-agnostic**: The viewer discovers docs from any repo. No content is bundled. Configure via `.env`.
- **File-system routing**: Directory structure determines URL routes. `index.md` files are section pages with child cards.
- **Full files in JSON, line extraction at runtime**: Simpler build script, enables richer browsing without re-running the build.
- **No bundled env loader**: `lib/env.js` has a tiny inline `.env` parser (~10 lines) to avoid adding a dependency.
- **Two separate `package.json` files**: `build/` only needs `gray-matter`. `app/` has the full React/Vite stack.
- **Mermaid node matching uses 5 strategies**: Flowchart nodes, direct ID, data-id, participant text matching (for sequence diagrams), and broad ID-contains fallback.

## Markdown format

Docs in the target repo follow this structure:

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
```

The `click` directives are the bridge between diagrams and source code. Format: `click <NodeID> href "#" "<filepath>:<startLine>-<endLine>"`. The `href "#"` is a no-op anchor — the app intercepts clicks via JS event handlers instead.
