const $ = (selector) => document.querySelector(selector);

const els = {
  tabs: $('#tabs'),
  tabsRow: $('#tabsRow'),
  sidebar: $('#sidebar'),
  toc: $('#toc'),
  chapterCount: $('#chapterCount'),
  openBtn: $('#openBtn'),
  emptyOpenBtn: $('#emptyOpenBtn'),
  toggleSidebarBtn: $('#toggleSidebarBtn'),
  modeSelect: $('#modeSelect'),
  themeSelect: $('#themeSelect'),
  emptyState: $('#emptyState'),
  documentStage: $('#documentStage'),
  documentName: $('#documentName'),
  documentPath: $('#documentPath'),
  markdownDocument: $('#markdownDocument'),
  readerScroll: $('#readerScroll'),
  currentChapterLabel: $('#currentChapterLabel'),
  pageCounter: $('#pageCounter'),
  prevBtn: $('#prevBtn'),
  nextBtn: $('#nextBtn'),
  liveStatus: $('#liveStatus'),
  updateBadge: $('#updateBadge')
};

const state = {
  tabs: [],
  activePath: null,
  mode: localStorage.getItem('vibereader.mode') || 'chapters',
  theme: localStorage.getItem('vibereader.theme') || 'aurora',
  sidebarOpen: localStorage.getItem('vibereader.sidebar') !== 'closed'
};

function encodeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function serializeNodes(nodes) {
  const wrapper = document.createElement('div');
  nodes.forEach((node) => wrapper.appendChild(node.cloneNode(true)));
  return wrapper.innerHTML;
}

function chapterOutlineFromHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return [...template.content.querySelectorAll('h2, h3')].map((heading) => ({
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

  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'H1') {
      if (intro.length) {
        const introHtml = serializeNodes(intro);
        if (introHtml.trim()) {
          chapters.push({
            id: 'document-intro',
            title: 'Mở đầu',
            html: introHtml,
            outline: chapterOutlineFromHtml(introHtml)
          });
        }
        intro = [];
      }

      pushCurrent();
      current = {
        id: node.id || `chapter-${chapters.length + 1}`,
        title: node.textContent.trim() || `Chương ${chapters.length + 1}`,
        nodes: [node]
      };
      continue;
    }

    if (current) current.nodes.push(node);
    else intro.push(node);
  }

  pushCurrent();

  if (intro.length) {
    const introHtml = serializeNodes(intro);
    if (introHtml.trim()) {
      chapters.push({
        id: 'document-root',
        title: fallbackTitle.replace(/\.(md|markdown|mdown|mkd|txt)$/i, ''),
        html: introHtml,
        outline: chapterOutlineFromHtml(introHtml)
      });
    }
  }

  if (!chapters.length) {
    chapters.push({
      id: 'empty-document',
      title: fallbackTitle.replace(/\.(md|markdown|mdown|mkd|txt)$/i, ''),
      html: '<p class="empty-document-note">File này hiện chưa có nội dung.</p>',
      outline: []
    });
  }

  return chapters;
}

function hydrateDocument(doc, previousTab = null) {
  const rendered = window.readerApi.renderMarkdown(doc.content, doc.path);
  const chapters = buildChapters(rendered.html, doc.name);
  const previousChapterId = previousTab?.chapters?.[previousTab.currentChapter]?.id;
  let currentChapter = previousTab?.currentChapter || 0;

  if (previousChapterId) {
    const matchingIndex = chapters.findIndex((chapter) => chapter.id === previousChapterId);
    if (matchingIndex >= 0) currentChapter = matchingIndex;
  }

  currentChapter = Math.min(Math.max(0, currentChapter), chapters.length - 1);

  return {
    path: doc.path,
    name: doc.name,
    content: doc.content,
    html: rendered.html,
    chapters,
    currentChapter,
    mtimeMs: doc.mtimeMs || Date.now(),
    missing: false,
    error: null
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

function restoreSessionMetadata() {
  try {
    return JSON.parse(localStorage.getItem('vibereader.session') || '{}');
  } catch {
    return {};
  }
}

async function restoreSession() {
  const session = restoreSessionMetadata();
  if (!Array.isArray(session.paths) || !session.paths.length) return;

  const docs = await window.readerApi.readPaths(session.paths);
  for (const doc of docs) {
    if (doc.error) continue;
    const tab = hydrateDocument(doc);
    if (Number.isInteger(session.chapters?.[tab.path])) {
      tab.currentChapter = Math.min(session.chapters[tab.path], tab.chapters.length - 1);
    }
    state.tabs.push(tab);
  }

  if (state.tabs.length) {
    state.activePath = state.tabs.some((tab) => tab.path === session.activePath)
      ? session.activePath
      : state.tabs[0].path;
    await window.readerApi.watchPaths(state.tabs.map((tab) => tab.path));
    render();
  }
}

function flashStatus(text, tone = 'normal') {
  els.updateBadge.textContent = text;
  els.updateBadge.dataset.tone = tone;
  els.liveStatus.classList.add('pulse');
  clearTimeout(flashStatus.timer);
  flashStatus.timer = setTimeout(() => {
    els.updateBadge.textContent = 'Đang theo dõi file';
    els.updateBadge.dataset.tone = 'normal';
    els.liveStatus.classList.remove('pulse');
  }, 1300);
}

async function addDocuments(docs) {
  const pathsToWatch = [];

  for (const doc of docs) {
    if (!doc || doc.error) continue;
    const existingIndex = state.tabs.findIndex((tab) => tab.path === doc.path);
    if (existingIndex >= 0) {
      state.tabs[existingIndex] = hydrateDocument(doc, state.tabs[existingIndex]);
    } else {
      state.tabs.push(hydrateDocument(doc));
      pathsToWatch.push(doc.path);
    }
    state.activePath = doc.path;
  }

  if (pathsToWatch.length) await window.readerApi.watchPaths(pathsToWatch);
  saveSession();
  render();
}

async function openFiles() {
  const docs = await window.readerApi.openFiles();
  if (docs?.length) await addDocuments(docs);
}

async function openPaths(paths) {
  if (!Array.isArray(paths) || !paths.length) return;
  const docs = await window.readerApi.readPaths(paths);
  await addDocuments(docs);
}

async function closeTab(filePath) {
  const index = state.tabs.findIndex((tab) => tab.path === filePath);
  if (index < 0) return;

  state.tabs.splice(index, 1);
  await window.readerApi.unwatchPath(filePath);

  if (state.activePath === filePath) {
    state.activePath = state.tabs[index]?.path || state.tabs[index - 1]?.path || null;
  }

  saveSession();
  render();
}

function activateTab(filePath) {
  state.activePath = filePath;
  saveSession();
  render();
}

function moveChapter(delta) {
  const tab = getActiveTab();
  if (!tab) return;
  const next = Math.min(Math.max(0, tab.currentChapter + delta), tab.chapters.length - 1);
  if (next === tab.currentChapter && state.mode === 'chapters') return;
  tab.currentChapter = next;
  saveSession();
  renderReader();
  renderToc();
}

function goToChapter(index, anchorId = null) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.currentChapter = Math.min(Math.max(0, index), tab.chapters.length - 1);
  saveSession();
  renderReader();
  renderToc();

  requestAnimationFrame(() => {
    if (anchorId) document.getElementById(anchorId)?.scrollIntoView({ block: 'start' });
    else els.readerScroll.scrollTop = 0;
  });
}

function renderTabs() {
  els.tabs.innerHTML = '';

  for (const tab of state.tabs) {
    const button = document.createElement('button');
    button.className = `tab ${tab.path === state.activePath ? 'active' : ''} ${tab.missing ? 'missing' : ''}`;
    button.title = tab.path;
    button.innerHTML = `
      <span class="tab-gem">◆</span>
      <span class="tab-name">${encodeText(tab.name)}</span>
      <span class="tab-close" role="button" aria-label="Đóng tab">×</span>
    `;
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

  tab.chapters.forEach((chapter, chapterIndex) => {
    const chapterButton = document.createElement('button');
    chapterButton.className = `toc-chapter ${chapterIndex === tab.currentChapter ? 'active' : ''}`;
    chapterButton.innerHTML = `
      <span class="toc-number">${String(chapterIndex + 1).padStart(2, '0')}</span>
      <span>${encodeText(chapter.title)}</span>
    `;
    chapterButton.addEventListener('click', () => goToChapter(chapterIndex));
    els.toc.appendChild(chapterButton);

    if (chapterIndex === tab.currentChapter && chapter.outline.length) {
      const children = document.createElement('div');
      children.className = 'toc-children';
      chapter.outline.forEach((item) => {
        const child = document.createElement('button');
        child.className = `toc-section level-${item.level}`;
        child.textContent = item.title;
        child.addEventListener('click', () => goToChapter(chapterIndex, item.id));
        children.appendChild(child);
      });
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

  if (state.mode === 'continuous') {
    els.markdownDocument.innerHTML = tab.html;
  } else {
    els.markdownDocument.innerHTML = chapter.html;
  }

  const hueSteps = [286, 328, 18, 48, 174, 210, 248];
  els.markdownDocument.style.setProperty('--chapter-hue', hueSteps[tab.currentChapter % hueSteps.length]);

  if (tab.missing) {
    flashStatus('File đã bị di chuyển hoặc xóa', 'danger');
  }
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

els.markdownDocument.addEventListener('click', (event) => {
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
    event.preventDefault();
    openFiles();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w' && getActiveTab()) {
    event.preventDefault();
    closeTab(state.activePath);
    return;
  }

  const targetTag = document.activeElement?.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return;

  if (event.key === 'PageUp' || (event.altKey && event.key === 'ArrowLeft')) {
    event.preventDefault();
    moveChapter(-1);
  }

  if (event.key === 'PageDown' || (event.altKey && event.key === 'ArrowRight')) {
    event.preventDefault();
    moveChapter(1);
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
  flashStatus('Đã cập nhật từ file', 'success');
});

window.readerApi.onOpenPaths(openPaths);

render();
restoreSession();
