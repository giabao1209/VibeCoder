# VibeReader

VibeReader is a standalone, colorful Markdown reader built with Electron. It keeps the Markdown file on disk as the single source of truth and re-renders automatically when another editor saves changes.

## Current MVP

- Open one or many `.md` / `.markdown` files in tabs.
- Watch each file on disk and refresh automatically after external edits.
- Treat every `# H1` as a logical chapter/page.
- Show `##` and `###` headings as nested navigation inside the active chapter.
- Previous/next chapter controls plus `PageUp`, `PageDown`, `Alt+Left`, and `Alt+Right` shortcuts.
- Chapter mode and continuous-reading mode.
- Four colorful themes: Aurora, Sunset, Ocean, and Forest.
- Syntax-highlighted code blocks, local images, tables, links, and blockquotes.
- Restore the last open tabs and chapter positions on restart.

## Run locally

```bash
npm install
npm start
```

## Build Windows portable `.exe`

```bash
npm install
npm run build
```

The portable executable is generated under `dist/`.

For an NSIS installer instead:

```bash
npm run build:installer
```

## Chapter convention

```md
# Chapter 1: Introduction

Text...

## Section 1.1

More text...

# Chapter 2: Runtime

Text...
```

If a file has no `# H1`, VibeReader treats the entire file as one chapter.

## Design rule

VibeReader is intentionally a reader, not a rich-text editor. Edit the source in VS Code, Neovim, Notepad, Obsidian, or any other Markdown editor; VibeReader watches the same file and updates the reading view automatically.
