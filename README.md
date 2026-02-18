# Doc Viewer

A repo-agnostic documentation viewer that renders interactive Mermaid diagrams with inline source code popovers. Point it at any repo with a `docs/` directory and it discovers, fetches, and renders all markdown content using file-system routing.

## How it works

The viewer has **no content of its own**. Markdown files live in the target repo (e.g. `givecampus/givecampus`) under a configurable `DOCS_PATH` (default: `docs/`). The build step discovers those files, parses them, and generates JSON that the React frontend renders.

### File-system routing

Directory structure determines URL routes:

```
docs/
  outreach/
    index.md                              → /outreach
    workflows/
      index.md                            → /outreach/workflows
      creating_an_outreach.md             → /outreach/workflows/creating_an_outreach
```

- `index.md` files are section pages that show child page cards
- Non-index files are leaf pages with full content

### Markdown format

Each markdown file uses YAML frontmatter and can contain Mermaid code fences with click directives that link diagram nodes to source code:

```markdown
---
title: Creating an Outreach
description: How outreach creation works end-to-end
tags: [outreach, controllers]
---

## Overview
Prose explaining the workflow...

```mermaid
flowchart TD
  A[Step 1] --> B[Step 2]
  click A href "#" "app/controllers/foo.rb:15-30"
  click B href "#" "app/services/bar.rb"
`` `
```

## Setup

### 1. Install dependencies

```bash
cd build && npm install && cd ../app && npm install && cd ..
```

### 2. Configure source repo access

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

**Option A — Local clone (recommended)**

```
LOCAL_REPO_ROOT=/Users/you/Workspace/givecampus
```

**Option B — GitHub API**

```
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

### 3. Run the dev server

```bash
cd app
npm run dev
```

This discovers docs, fetches source files, and starts Vite on port 3100.

To skip re-fetching (uses cached JSON):

```bash
npm run dev:cached
```

## Project structure

```
build/
  fetch-docs.js           Discovers + fetches + parses docs → pages.json
  extract-code-snippets.js  Fetches source files → source-files.json
  lib/env.js              Shared env loading, fetch helpers
  package.json            Build dependency: gray-matter
app/
  src/
    App.jsx               Router + settings dropdown
    components/
      DocPage.jsx         Unified page renderer (index + leaf pages)
      Breadcrumb.jsx      Breadcrumb navigation
      MermaidDiagram.jsx  Mermaid SVG with click handlers
      NodePopover.jsx     Source code popover
      CodeBlock.jsx       Syntax-highlighted code
      MarkdownRenderer.jsx  Prose sections
    data/                 Generated JSON (gitignored)
    styles/theme.css      Design system
  package.json            React, Vite, Mermaid, highlight.js
```

## Pointing at a different repo

Set these in `.env`:

```
GITHUB_OWNER=your-org
GITHUB_REPO=your-repo
GITHUB_REF=main
DOCS_PATH=docs
```

Or for local development:

```
LOCAL_REPO_ROOT=/path/to/your-repo
DOCS_PATH=docs
```

## Settings

Click the gear icon in the app header to configure:

- **Editor** — which editor to open files in (VS Code, Cursor, RubyMine, etc.)
- **Local repo path** — path to your local repo clone for "Open in Editor" links
