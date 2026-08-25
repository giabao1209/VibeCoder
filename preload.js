const { contextBridge, ipcRenderer } = require('electron');
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
      // Leave the original src untouched when resolution fails.
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
    headings
  };
}

contextBridge.exposeInMainWorld('readerApi', {
  openFiles: () => ipcRenderer.invoke('files:open'),
  readPaths: (paths) => ipcRenderer.invoke('files:read', paths),
  watchPaths: (paths) => ipcRenderer.invoke('files:watch', paths),
  unwatchPath: (filePath) => ipcRenderer.invoke('files:unwatch', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  renderMarkdown,
  onFileChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('files:changed', listener);
    return () => ipcRenderer.removeListener('files:changed', listener);
  },
  onOpenPaths: (callback) => {
    const listener = (_event, paths) => callback(paths);
    ipcRenderer.on('app:open-paths', listener);
    return () => ipcRenderer.removeListener('app:open-paths', listener);
  }
});
