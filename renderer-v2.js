const $ = (selector) => document.querySelector(selector);

const els = {
  tabs: $('#tabs'), sidebar: $('#sidebar'), toc: $('#toc'), chapterCount: $('#chapterCount'),
  openBtn: $('#openBtn'), emptyOpenBtn: $('#emptyOpenBtn'), toggleSidebarBtn: $('#toggleSidebarBtn'),
  modeSelect: $('#modeSelect'), themeSelect: $('#themeSelect'), emptyState: $('#emptyState'),
  documentStage: $('#documentStage'), documentName: $('#documentName'), documentPath: $('#documentPath'),
  document: $('#markdownDocument'), readerScroll: $('#readerScroll'), currentChapterLabel: $('#currentChapterLabel'),
  pageCounter: $('#pageCounter'), prevBtn: $('#prevBtn'), nextBtn: $('#nextBtn'),
  liveStatus: $('#liveStatus'), updateBadge: $('#updateBadge')
};

const state = {
  tabs: [],
  activePath: null,
  mode: localStorage.getItem('vibereader.mode') || 'chapters',
  theme: localStorage.getItem('vibereader.theme') || 'aurora',
  sidebarOpen: localStorage.getItem('vibereader.sidebar') !== 'closed'
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fileFormat(filePath) {
  return /\.tex$/i.test(filePath || '') ? 'latex' : 'markdown';
}

function bareName(name) {
  return String(name || 'document').replace(/\.(md|markdown|mdown|mkd|txt|tex)$/i, '');
}

function serializeNodes(nodes) {
  const wrapper = document.createElement('div');
  nodes.forEach((node) => wrapper.appendChild(node.cloneNode(true)));
  return wrapper.innerHTML;
}

function chapterOutlineFromHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return [...template.content.querySelectorAll('h2, h3, h4')].map((heading) => ({
    level: Number(heading.tagName.slice(1)),
    id: heading.id,
    title: heading.textContent.trim()
  }));
}

function buildChapters(html, fallbackTitle) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const nodes = [...template.content.childNodes];
  const chapters = [];
  let current = null;
  let intro = [];

  const pushCurrent = () => {
    if (!current) return;
    current.html = serializeNodes(current.nodes);
    current.outline = chapterOutlineFromHtml(current.html);
    delete current.nodes;
    chapters.push(current);
    current = null;
  };

  const pushIntro = () => {
    if (!intro.length) return;
    const htmlChunk = serializeNodes(intro);
    if (htmlChunk.trim()) {
      chapters.push({
        id: chapters.length ? `document-intro-${chapters.length}` : 'document-intro',
        title: chapters.length ? 'Phần mở rộng' : 'Mở đầu',
        html: htmlChunk,
        outline: chapterOutlineFromHtml(htmlChunk)
      });
    }
    intro = [];
  };

  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'H1') {
      pushIntro();
      pushCurrent();
      current = {
        id: node.id || `chapter-${chapters.length + 1}`,
        title: node.textContent.trim() || `Chương ${chapters.length + 1}`,
        nodes: [node]
      };
    } else if (current) {
      current.nodes.push(node);
    } else {
      intro.push(node);
    }
  }

  pushCurrent();
  pushIntro();

  if (!chapters.length) {
    chapters.push({
      id: 'document-root',
      title: bareName(fallbackTitle),
      html: html || '<p class="empty-document-note">File này hiện chưa có nội dung.</p>',
      outline: chapterOutlineFromHtml(html)
    });
  }

  return chapters;
}

function renderSource(doc) {
  const format = fileFormat(doc.path);
  if (format === 'latex') return window.readerApi.renderLatex(doc.content, doc.path);
  return window.readerApi.renderMarkdown(doc.content, doc.path);
}

function hydrateDocument(doc, previous = null) {
  let rendered;
  let renderError = null;
  try {
    rendered = renderSource(doc);
  } catch (error) {
    renderError = error?.message || String(error);
    rendered = {
      html: `<div class="render-failure"><h1>Không render được tài liệu</h1><p>${escapeHtml(renderError)}</p></div>`,
      format: fileFormat(doc.path)
    };
  }

  const chapters = buildChapters(rendered.html, doc.name);
  const previousChapterId = previous?.chapters?.[previous.currentChapter]?.id;
  let currentChapter = previous?.currentChapter || 0;
  if (previousChapterId) {
    const match = chapters.findIndex((chapter) => chapter.id === previousChapterId);
    if (match >= 0) currentChapter = match;
  }
  currentChapter = Math.min(Math.max(0, currentChapter), chapters.length - 1);

  return {
    path: doc.path,
    name: doc.name,
    format: rendered.format || fileFormat(doc.path),
    html: rendered.html,
    chapters,
    currentChapter,
    mtimeMs: doc.mtimeMs || Date.now(),
    missing: false,
    error: renderError
  };
}

function getActiveTab() {
  return state.tabs.find((tab) => tab.path === state.activePath) || null;
}

function saveSession() {
  localStorage.setItem('vibereader.session', JSON.stringify({
    paths: state.tabs.map((tab) => tab.path),
    activePath: state.activePath,
    chapters: Object.fromEntries(state.tabs.map((tab) => [tab.path, tab.currentChapter]))
  }));
}

function readSession() {
  try { return JSON.parse(localStorage.getItem('vibereader.session') || '{}'); }
  catch { return {}; }
}

async function restoreSession() {
  const session = readSession();
  if (!Array.isArray(session.paths) || !session.paths.length) return;
  const docs = await window.readerApi.readPaths(session.paths);
  for (const doc of docs) {
    if (!doc || doc.error) continue;
    const tab = hydrateDocument(doc);
    const savedChapter = session.chapters?.[tab.path];
    if (Number.isInteger(savedChapter)) tab.currentChapter = Math.min(savedChapter, tab.chapters.length - 1);
    state.tabs.push(tab);
  }
  if (!state.tabs.length) return;
  state.activePath = state.tabs.some((tab) => tab.path === session.activePath) ? session.activePath : state.tabs[0].path;
  await window.readerApi.watchPaths(state.tabs.map((tab) => tab.path));
  render();
}

function normalStatusText(tab = getActiveTab()) {
  if (!tab) return 'Đang theo dõi file';
  return tab.format === 'latex' ? 'LaTeX · đang theo dõi' : 'Markdown · đang theo dõi';
}

function flashStatus(text, tone = 'normal') {
  els.updateBadge.textContent = text;
  els.updateBadge.dataset.tone = tone;
  els.liveStatus.classList.add('pulse');
  clearTimeout(flashStatus.timer);
  flashStatus.timer = setTimeout(() => {
    els.updateBadge.textContent = normalStatusText();
    els.updateBadge.dataset.tone = 'normal';
    els.liveStatus.classList.remove('pulse');
  }, 1400);
}

async function addDocuments(docs) {
  const watch = [];
  for (const doc of docs || []) {
    if (!doc || doc.error) continue;
    const index = state.tabs.findIndex((tab) => tab.path === doc.path);
    if (index >= 0) state.tabs[index] = hydrateDocument(doc, state.tabs[index]);
    else {
      state.tabs.push(hydrateDocument(doc));
      watch.push(doc.path);
    }
    state.activePath = doc.path;
  }
  if (watch.length) await window.readerApi.watchPaths(watch);
  saveSession();
  render();
}

async function openFiles() {
  const docs = await window.readerApi.openFiles();
  if (docs?.length) await addDocuments(docs);
}

async function openPaths(paths) {
  if (!Array.isArray(paths) || !paths.length) return;
  await addDocuments(await window.readerApi.readPaths(paths));
}

async function closeTab(filePath) {
  const index = state.tabs.findIndex((tab) => tab.path === filePath);
  if (index < 0) return;
  state.tabs.splice(index, 1);
  await window.readerApi.unwatchPath(filePath);
  if (state.activePath === filePath) state.activePath = state.tabs[index]?.path || state.tabs[index - 1]?.path || null;
  saveSession();
  render();
}

function activateTab(filePath) {
  state.activePath = filePath;
  saveSession();
  render();
}

function goToChapter(index, anchorId = null) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.currentChapter = Math.min(Math.max(0, index), tab.chapters.length - 1);
  saveSession();
  renderToc();
  renderReader();
  requestAnimationFrame(() => {
    if (anchorId) document.getElementById(anchorId)?.scrollIntoView({ block: 'start' });
    else els.readerScroll.scrollTop = 0;
  });
}

function moveChapter(delta) {
  const tab = getActiveTab();
  if (!tab) return;
  goToChapter(tab.currentChapter + delta);
}

function renderTabs() {
  els.tabs.innerHTML = '';
  for (const tab of state.tabs) {
    const button = document.createElement('button');
    button.className = `tab ${tab.path === state.activePath ? 'active' : ''} ${tab.missing ? 'missing' : ''}`;
    button.title = tab.path;
    button.innerHTML = `<span class="tab-format ${tab.format}">${tab.format === 'latex' ? 'TEX' : 'MD'}</span><span class="tab-name">${escapeHtml(tab.name)}</span><span class="tab-close" role="button" aria-label="Đóng tab">×</span>`;
    button.addEventListener('click', (event) => {
      if (event.target.closest('.tab-close')) closeTab(tab.path);
      else activateTab(tab.path);
    });
    els.tabs.appendChild(button);
  }
}

function renderToc() {
  const tab = getActiveTab();
  els.toc.innerHTML = '';
  els.chapterCount.textContent = tab ? `${tab.chapters.length} chương` : '0 chương';
  if (!tab) return;

  tab.chapters.forEach((chapter, index) => {
    const button = document.createElement('button');
    button.className = `toc-chapter ${index === tab.currentChapter ? 'active' : ''}`;
    button.innerHTML = `<span class="toc-number">${String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(chapter.title)}</span>`;
    button.addEventListener('click', () => goToChapter(index));
    els.toc.appendChild(button);

    if (index === tab.currentChapter && chapter.outline.length) {
      const children = document.createElement('div');
      children.className = 'toc-children';
      for (const item of chapter.outline) {
        const child = document.createElement('button');
        child.className = `toc-section level-${item.level}`;
        child.textContent = item.title;
        child.addEventListener('click', () => goToChapter(index, item.id));
        children.appendChild(child);
      }
      els.toc.appendChild(children);
    }
  });
}

function renderReader() {
  const tab = getActiveTab();
  const hasDocument = Boolean(tab);
  els.emptyState.classList.toggle('hidden', hasDocument);
  els.documentStage.classList.toggle('hidden', !hasDocument);
  if (!tab) return;

  const chapter = tab.chapters[tab.currentChapter];
  els.documentName.textContent = tab.name;
  els.documentPath.textContent = tab.path;
  els.currentChapterLabel.textContent = chapter.title;
  els.pageCounter.textContent = `${tab.currentChapter + 1} / ${tab.chapters.length}`;
  els.prevBtn.disabled = tab.currentChapter === 0;
  els.nextBtn.disabled = tab.currentChapter === tab.chapters.length - 1;
  els.updateBadge.textContent = normalStatusText(tab);

  els.document.classList.toggle('latex-mode', tab.format === 'latex');
  els.document.classList.toggle('markdown-mode', tab.format !== 'latex');
  els.document.innerHTML = state.mode === 'continuous' ? tab.html : chapter.html;

  const hues = [286, 328, 18, 48, 174, 210, 248];
  els.document.style.setProperty('--chapter-hue', hues[tab.currentChapter % hues.length]);
  if (tab.missing) flashStatus('File đã bị di chuyển hoặc xóa', 'danger');
}

function render() {
  document.body.dataset.theme = state.theme;
  els.themeSelect.value = state.theme;
  els.modeSelect.value = state.mode;
  els.sidebar.classList.toggle('collapsed', !state.sidebarOpen);
  els.toggleSidebarBtn.classList.toggle('active', state.sidebarOpen);
  renderTabs();
  renderToc();
  renderReader();
}

els.openBtn.addEventListener('click', openFiles);
els.emptyOpenBtn.addEventListener('click', openFiles);
els.prevBtn.addEventListener('click', () => moveChapter(-1));
els.nextBtn.addEventListener('click', () => moveChapter(1));
els.toggleSidebarBtn.addEventListener('click', () => {
  state.sidebarOpen = !state.sidebarOpen;
  localStorage.setItem('vibereader.sidebar', state.sidebarOpen ? 'open' : 'closed');
  render();
});
els.modeSelect.addEventListener('change', () => {
  state.mode = els.modeSelect.value;
  localStorage.setItem('vibereader.mode', state.mode);
  renderReader();
});
els.themeSelect.addEventListener('change', () => {
  state.theme = els.themeSelect.value;
  localStorage.setItem('vibereader.theme', state.theme);
  render();
});

els.document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  if (href.startsWith('#')) return;
  if (/^(https?:|mailto:)/i.test(href)) {
    event.preventDefault();
    window.readerApi.openExternal(href);
  }
});

window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault(); openFiles(); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w' && getActiveTab()) {
    event.preventDefault(); closeTab(state.activePath); return;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'PageUp' || (event.altKey && event.key === 'ArrowLeft')) {
    event.preventDefault(); moveChapter(-1);
  }
  if (event.key === 'PageDown' || (event.altKey && event.key === 'ArrowRight')) {
    event.preventDefault(); moveChapter(1);
  }
});

window.readerApi.onFileChanged((payload) => {
  const index = state.tabs.findIndex((tab) => tab.path === payload.path);
  if (index < 0) return;
  if (payload.missing) {
    state.tabs[index].missing = true;
    render();
    return;
  }
  if (payload.error) {
    state.tabs[index].error = payload.error;
    flashStatus('Không thể đọc thay đổi', 'danger');
    return;
  }
  state.tabs[index] = hydrateDocument(payload, state.tabs[index]);
  saveSession();
  render();
  flashStatus(state.tabs[index].format === 'latex' ? 'Đã render lại LaTeX' : 'Đã cập nhật Markdown', 'success');
});

window.readerApi.onOpenPaths(openPaths);
render();
restoreSession();
