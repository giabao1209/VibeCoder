# VibeReader

VibeReader is a standalone, colorful Markdown and lightweight LaTeX reader built with Electron. Files on disk remain the single source of truth and the reading view re-renders automatically after external edits are saved.

## Current features

- Open one or many `.md`, `.markdown`, and `.tex` files in tabs.
- Watch files on disk and refresh automatically after external edits.
- Markdown: every `# H1` becomes a logical chapter/page.
- LaTeX: `\section` becomes a logical chapter in `article`; `\chapter` becomes a logical chapter in `book`/`report`.
- Nested table of contents plus previous/next chapter navigation.
- Chapter mode and continuous-reading mode.
- Lightweight LaTeX support with KaTeX-powered math rendering.
- Syntax-highlighted code, local images, tables, links, and blockquotes.
- Restore last-open tabs and chapter positions on restart.

## Document themes

VibeReader 0.3 introduces four complete reading themes. The theme switch changes both the app chrome and the document canvas.

- **Candy Paper** — default. Bright editorial paper using the coral / teal / yellow visual language from the original `md2pdf.py` renderer.
- **Midnight Ink** — dark technical/editorial reading theme with violet, cyan, and pink accents.
- **Ocean Glass** — bright cool paper with teal/blue typography and glassy ocean chrome.
- **Sepia Scholar** — warm book-like paper with serif body text and restrained academic colors.

## Run locally

```bash
npm install
npm start
```

## Build Windows portable `.exe`

```bash
npm run build
```

The portable executable is generated under `dist/`.

For an NSIS installer instead:

```bash
npm run build:installer
```

## Design rule

VibeReader is intentionally a reader, not a rich-text editor. Edit the source in VS Code, Neovim, Notepad, Obsidian, or another editor; VibeReader watches the same file and updates the reading view automatically.

The current `.tex` path is a lightweight reader, not a full TeX distribution. Arbitrary CTAN packages, BibTeX/Biber projects, TikZ, and complex custom macro systems require a future full compiler mode.
