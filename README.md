# Outreach System — Architecture Docs

Interactive documentation for the GiveCampus outreach system. Visualizes workflows with Mermaid diagrams and inline source code popovers.

## Setup

### 1. Install dependencies

```bash
cd build && npm install && cd ../app && npm install && cd ..
```

### 2. Configure source file access

The build step fetches source files from the `givecampus/givecampus` repo. You have two options:

**Option A — Local clone (recommended for developers with the repo)**

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Then set `LOCAL_REPO_ROOT` to the path of your local clone:

```
LOCAL_REPO_ROOT=/Users/you/Workspace/givecampus
```

**Option B — GitHub API (no local clone needed)**

Set a GitHub personal access token with `repo` scope:

```
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

### 3. Run the dev server

```bash
cd app
npm run dev
```

This parses the workflow markdown, fetches source files, and starts Vite on port 3100.

To skip re-fetching source files (uses cached JSON):

```bash
npm run dev:cached
```

## Project structure

```
workflows/          Markdown source files (7 workflow documents)
build/              Build scripts (parse markdown, fetch source files)
app/                React + Vite frontend
  src/components/   UI components (diagrams, popovers, code viewer)
  src/data/         Generated JSON (gitignored)
  src/styles/       Theme CSS
```

## Settings

Click the gear icon in the app header to configure:

- **Editor** — which editor to open files in (VS Code, Cursor, RubyMine, etc.)
- **Local repo path** — path to your local `givecampus` clone for "Open in Editor" links
