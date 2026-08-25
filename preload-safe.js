const { contextBridge, ipcRenderer } = require('electron');

let markdownModule = null;
let markdownError = null;
let latexModule = null;
let latexError = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lazyMarkdown(source, filePath) {
  if (!markdownModule && !markdownError) {
    try {
      markdownModule = require('./markdown-renderer');
    } catch (error) {
      markdownError = error;
      console.error('[VibeReader] Markdown renderer failed to load:', error);
    }
  }

  if (markdownModule?.renderMarkdown) return markdownModule.renderMarkdown(source, filePath);

  return {
    html: `<div class="render-failure"><h1>Markdown renderer unavailable</h1><p>${escapeHtml(markdownError?.message || 'Unknown renderer error')}</p><pre>${escapeHtml(source ?? '')}</pre></div>`,
    headings: [],
    format: 'markdown'
  };
}

function lazyLatex(source, filePath) {
  if (!latexModule && !latexError) {
    try {
      latexModule = require('./latex-renderer');
    } catch (error) {
      latexError = error;
      console.error('[VibeReader] LaTeX renderer failed to load:', error);
    }
  }

  if (latexModule?.renderLatex) return latexModule.renderLatex(source, filePath);

  return {
    html: `<div class="render-failure"><h1>LaTeX renderer unavailable</h1><p>${escapeHtml(latexError?.message || 'Unknown renderer error')}</p><pre>${escapeHtml(source ?? '')}</pre></div>`,
    headings: [],
    format: 'latex'
  };
}

contextBridge.exposeInMainWorld('readerApi', {
  openFiles: () => ipcRenderer.invoke('files:open'),
  readPaths: (paths) => ipcRenderer.invoke('files:read', paths),
  watchPaths: (paths) => ipcRenderer.invoke('files:watch', paths),
  unwatchPath: (filePath) => ipcRenderer.invoke('files:unwatch', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (session) => ipcRenderer.invoke('session:save', session),
  renderMarkdown: lazyMarkdown,
  renderLatex: lazyLatex,
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
