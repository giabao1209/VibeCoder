const path = require('path');
const { pathToFileURL } = require('url');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(code, language) {
    try {
      if (language && hljs.getLanguage(language)) {
        return `<pre class="hljs"><code>${hljs.highlight(code, { language }).value}</code></pre>`;
      }
      return `<pre class="hljs"><code>${hljs.highlightAuto(code).value}</code></pre>`;
    } catch {
      return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`;
    }
  }
});

const MERMAID_FENCE_LANGUAGES = new Set(['mermaid', 'mmd']);
const MERMAID_START = /^(?:classDiagram(?:-v2)?|sequenceDiagram|flowchart(?:-elk)?|graph|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|mindmap|timeline|zenuml|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture-beta|radar-beta|treemap-beta|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/i;

function fenceLanguage(info) {
  return String(info || '').trim().split(/\s+/)[0].toLowerCase();
}

function looksLikeMermaid(source) {
  const lines = String(source || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  let inFrontmatter = false;

  for (let index = 0; index < Math.min(lines.length, 40); index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    // Mermaid comments and init directives may appear before the diagram declaration.
    if (line.startsWith('%%')) continue;

    return MERMAID_START.test(line);
  }

  return false;
}

const defaultFenceRenderer = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const language = fenceLanguage(token.info);
  const explicitMermaid = MERMAID_FENCE_LANGUAGES.has(language) || MERMAID_START.test(language);
  const implicitMermaid = !language && looksLikeMermaid(token.content);

  if (explicitMermaid || implicitMermaid) {
    const source = md.utils.escapeHtml(String(token.content || ''));
    return `<div class="mermaid-shell"><pre class="mermaid-source" data-vibereader-mermaid="pending">${source}</pre></div>\n`;
  }

  return defaultFenceRenderer(tokens, idx, options, env, self);
};

const defaultImageRenderer = md.renderer.rules.image || ((tokens, idx, options, env, self) => {
  return self.renderToken(tokens, idx, options);
});

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet('src');

  if (src && env.filePath && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) {
    try {
      const resolved = path.resolve(path.dirname(env.filePath), decodeURIComponent(src));
      token.attrSet('src', pathToFileURL(resolved).href);
    } catch {
      // Keep original URL when resolution fails.
    }
  }

  token.attrSet('loading', 'lazy');
  return defaultImageRenderer(tokens, idx, options, env, self);
};

function slugify(value) {
  const cleaned = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || 'section';
}

function renderMarkdown(source, filePath) {
  const env = { filePath };
  const tokens = md.parse(String(source ?? ''), env);
  const headings = [];
  const slugCounts = new Map();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== 'heading_open') continue;

    const level = Number(token.tag.slice(1));
    const inline = tokens[i + 1];
    const title = inline?.content?.trim() || `Section ${headings.length + 1}`;
    const base = slugify(title);
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    const id = count ? `${base}-${count + 1}` : base;

    token.attrSet('id', id);
    headings.push({ level, title, id });
  }

  return {
    html: md.renderer.render(tokens, md.options, env),
    headings,
    format: 'markdown'
  };
}

module.exports = { renderMarkdown, looksLikeMermaid };
