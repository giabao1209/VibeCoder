# VibeReader

VibeReader is a standalone, colorful live document reader built with Electron. The source file on disk remains the single source of truth: edit it in VS Code, Neovim, Notepad, Obsidian, or another editor, save, and VibeReader re-renders it automatically.

## Supported documents

### Markdown

- `.md`, `.markdown`, `.mdown`, `.mkd`, `.txt`
- GitHub-style Markdown basics, tables, links, local images, blockquotes, and highlighted code blocks.
- Every `# H1` becomes a logical chapter/page; `##` and `###` become nested TOC entries.

### LaTeX (lightweight reader mode)

- `.tex`
- Full document wrappers (`\\documentclass`, `\\begin{document}`) or body-only snippets.
- `\\chapter`, `\\section`, `\\subsection`, `\\subsubsection` navigation.
- `\\title`, `\\author`, `\\date`, `\\maketitle`, abstract, quote, center, verbatim.
- `itemize` and `enumerate`.
- Common text formatting such as `\\textbf`, `\\textit`, `\\emph`, `\\underline`, `\\texttt`.
- Inline and display mathematics rendered with KaTeX.
- Common equation/align/gather environments.
- `\\href`, `\\url`, and local/remote `\\includegraphics`.

LaTeX support in v0.2 is intentionally a fast reader renderer, not a complete TeX distribution. Arbitrary CTAN packages, BibTeX compilation, custom macro-heavy documents, shell escape, TikZ compilation, and pixel-identical PDF output are not guaranteed. A future full mode can invoke/bundle a real TeX engine for that level of compatibility.

## Reader features

- Multiple Markdown and LaTeX tabs at the same time.
- Live disk watcher with automatic re-render after external saves.
- Chapter mode and continuous-reading mode.
- Previous/next chapter controls plus `PageUp`, `PageDown`, `Alt+Left`, and `Alt+Right`.
- Four themes: Aurora, Sunset, Ocean, Forest.
- Restores open tabs and chapter positions on restart.

## Run locally

```bash
npm install
npm start
```

After updating from v0.1 to v0.2, run `npm install` again because KaTeX is a new dependency.

## Build Windows portable `.exe`

```bash
npm install
npm run build
```

The portable executable is generated under `dist/`.

For an NSIS installer:

```bash
npm run build:installer
```

## Test files

- `sample.md` demonstrates Markdown mode.
- `sample.tex` demonstrates LaTeX mode and live rendering.
