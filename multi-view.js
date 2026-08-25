(() => {
  const api = window.readerApi;
  const toggleBtn = document.getElementById('multiViewBtn');
  const layoutSelect = document.getElementById('multiLayoutSelect');
  const stage = document.getElementById('multiViewStage');
  const grid = document.getElementById('multiViewGrid');
  const tabsHost = document.getElementById('tabs');
  const openBtn = document.getElementById('openBtn');
  const modeSelect = document.getElementById('modeSelect');

  if (!api || !toggleBtn || !layoutSelect || !stage || !grid || !tabsHost || !openBtn || !modeSelect) return;

  const STORAGE_KEY = 'vibereader.multiview';
  const modelCache = new Map();

  function loadState() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch { saved = {}; }

    const layout = [2, 3, 4].includes(Number(saved.layout)) ? Number(saved.layout) : 2;
    const panes = Array.from({ length: 4 }, (_, index) => {
      const pane = saved.panes?.[index];
      return {
        path: typeof pane?.path === 'string' ? pane.path : null,
        chapters: pane?.chapters && typeof pane.chapters === 'object' ? pane.chapters : {},
        scrolls: pane?.scrolls && typeof pane.scrolls === 'object' ? pane.scrolls : {}
      };
    });

    return { enabled: Boolean(saved.enabled), layout, panes };
  }

  const state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  function fileFormat(filePath) {
    return /\.tex$/i.test(filePath || '') ? 'latex' : 'markdown';
  }

  function bareName(filePath) {
    const name = String(filePath || '').split(/[\\/]/).pop() || 'Document';
    return name.replace(/\.(md|markdown|mdown|mkd|txt|tex)$/i, '');
  }

  function getOpenTabs() {
    return [...tabsHost.querySelectorAll('.tab')]
      .map((tab) => ({
        path: tab.title?.trim() || '',
        name: tab.querySelector('.tab-name')?.textContent?.trim() || bareName(tab.title),
        format: tab.querySelector('.tab-format')?.textContent?.trim() || (fileFormat(tab.title) === 'latex' ? 'TEX' : 'MD')
      }))
      .filter((item) => item.path);
  }

  function capturePaneScroll(index) {
    const paneState = state.panes[index];
    const scroll = grid.querySelector(`.multi-pane[data-pane-index="${index}"] .multi-pane-scroll`);
    if (!paneState?.path || !scroll) return;
    const chapter = Number(paneState.chapters[paneState.path] || 0);
    const key = `${paneState.path}::${modeSelect.value || 'chapters'}::${chapter}`;
    paneState.scrolls[key] = Math.max(0, Math.round(scroll.scrollTop || 0));
  }

  function captureAllScrolls() {
    for (let index = 0; index < state.layout; index += 1) capturePaneScroll(index);
    saveState();
  }

  function ensureAssignments() {
    const tabs = getOpenTabs();
    const openPaths = new Set(tabs.map((tab) => tab.path));

    for (let index = 0; index < state.layout; index += 1) {
      const pane = state.panes[index];
      if (pane.path && !openPaths.has(pane.path)) pane.path = null;
    }

    const used = new Set(state.panes.slice(0, state.layout).map((pane) => pane.path).filter(Boolean));
    const free = tabs.map((tab) => tab.path).filter((path) => !used.has(path));
    for (let index = 0; index < state.layout; index += 1) {
      const pane = state.panes[index];
      if (!pane.path && free.length) pane.path = free.shift();
    }

    saveState();
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
        title: fallbackTitle,
        html: html || '<p class="empty-document-note">File này hiện chưa có nội dung.</p>',
        outline: chapterOutlineFromHtml(html)
      });
    }

    return chapters;
  }

  function renderSource(doc) {
    if (fileFormat(doc.path) === 'latex') return api.renderLatex(doc.content, doc.path);
    return api.renderMarkdown(doc.content, doc.path);
  }

  function modelFromDocument(doc) {
    const cached = modelCache.get(doc.path);
    if (cached && cached.mtimeMs === doc.mtimeMs) return cached;

    const rendered = renderSource(doc);
    const model = {
      path: doc.path,
      name: doc.name,
      format: rendered.format || fileFormat(doc.path),
      html: rendered.html,
      chapters: buildChapters(rendered.html, bareName(doc.name)),
      mtimeMs: doc.mtimeMs
    };
    modelCache.set(doc.path, model);
    return model;
  }

  function paneOptions(selectedPath) {
    const tabs = getOpenTabs();
    const options = ['<option value="">— Chọn tài liệu —</option>'];
    for (const tab of tabs) {
      options.push(`<option value="${escapeHtml(tab.path)}" ${tab.path === selectedPath ? 'selected' : ''}>${escapeHtml(tab.format)} · ${escapeHtml(tab.name)}</option>`);
    }
    return options.join('');
  }

  function buildPaneShell(index) {
    const paneState = state.panes[index];
    const pane = document.createElement('section');
    pane.className = 'multi-pane';
    pane.dataset.paneIndex = String(index);
    pane.innerHTML = `
      <header class="multi-pane-header">
        <span class="multi-pane-number">${index + 1}</span>
        <select class="multi-pane-select" aria-label="Tài liệu cho pane ${index + 1}">
          ${paneOptions(paneState.path)}
        </select>
        <button class="multi-pane-open" title="Mở thêm tài liệu">＋</button>
      </header>
      <div class="multi-pane-scroll">
        <article class="markdown-document multi-pane-document">
          <div class="multi-pane-placeholder"><strong>Pane ${index + 1}</strong><span>Chọn một tab đang mở hoặc mở thêm tài liệu.</span></div>
        </article>
      </div>
      <footer class="multi-pane-footer">
        <button class="multi-pane-prev">←</button>
        <span class="multi-pane-title">Chưa chọn file</span>
        <span class="multi-pane-counter">0 / 0</span>
        <button class="multi-pane-next">→</button>
      </footer>`;

    pane.querySelector('.multi-pane-select').addEventListener('change', (event) => {
      capturePaneScroll(index);
      paneState.path = event.target.value || null;
      saveState();
      renderPane(index, pane);
    });

    pane.querySelector('.multi-pane-open').addEventListener('click', () => openBtn.click());
    pane.querySelector('.multi-pane-prev').addEventListener('click', () => movePaneChapter(index, -1));
    pane.querySelector('.multi-pane-next').addEventListener('click', () => movePaneChapter(index, 1));

    pane.querySelector('.multi-pane-scroll').addEventListener('scroll', (event) => {
      if (!paneState.path) return;
      const chapter = Number(paneState.chapters[paneState.path] || 0);
      const key = `${paneState.path}::${modeSelect.value || 'chapters'}::${chapter}`;
      paneState.scrolls[key] = Math.max(0, Math.round(event.currentTarget.scrollTop || 0));
      saveState();
    }, { passive: true });

    return pane;
  }

  function restorePaneScroll(index, pane, model, chapterIndex) {
    const paneState = state.panes[index];
    const scroll = pane.querySelector('.multi-pane-scroll');
    const mode = modeSelect.value || 'chapters';
    const key = `${paneState.path}::${mode}::${chapterIndex}`;
    const saved = Number(paneState.scrolls[key]);

    requestAnimationFrame(() => {
      if (Number.isFinite(saved) && saved >= 0) {
        scroll.scrollTop = saved;
        return;
      }

      if (mode === 'continuous') {
        const chapter = model.chapters[chapterIndex];
        const heading = chapter?.id ? pane.querySelector(`#${cssEscape(chapter.id)}`) : null;
        scroll.scrollTop = heading ? Math.max(0, heading.offsetTop - 20) : 0;
      } else {
        scroll.scrollTop = 0;
      }
    });
  }

  function paintPane(index, pane, model) {
    const paneState = state.panes[index];
    const docEl = pane.querySelector('.multi-pane-document');
    const titleEl = pane.querySelector('.multi-pane-title');
    const counterEl = pane.querySelector('.multi-pane-counter');
    const prev = pane.querySelector('.multi-pane-prev');
    const next = pane.querySelector('.multi-pane-next');

    let chapterIndex = Number(paneState.chapters[paneState.path] || 0);
    chapterIndex = Math.min(Math.max(0, chapterIndex), model.chapters.length - 1);
    paneState.chapters[paneState.path] = chapterIndex;

    const chapter = model.chapters[chapterIndex];
    docEl.classList.toggle('latex-mode', model.format === 'latex');
    docEl.classList.toggle('markdown-mode', model.format !== 'latex');
    docEl.innerHTML = modeSelect.value === 'continuous' ? model.html : chapter.html;
    docEl.style.setProperty('--chapter-hue', [286, 328, 18, 48, 174, 210, 248][chapterIndex % 7]);

    titleEl.textContent = chapter.title || model.name;
    titleEl.title = `${model.name} — ${chapter.title || ''}`;
    counterEl.textContent = `${chapterIndex + 1} / ${model.chapters.length}`;
    prev.disabled = chapterIndex === 0;
    next.disabled = chapterIndex === model.chapters.length - 1;
    pane.dataset.format = model.format;
    saveState();
    restorePaneScroll(index, pane, model, chapterIndex);
  }

  async function renderPane(index, pane = grid.querySelector(`.multi-pane[data-pane-index="${index}"]`)) {
    if (!pane) return;
    const paneState = state.panes[index];
    const select = pane.querySelector('.multi-pane-select');
    select.innerHTML = paneOptions(paneState.path);
    select.value = paneState.path || '';

    if (!paneState.path) {
      pane.querySelector('.multi-pane-document').innerHTML = `<div class="multi-pane-placeholder"><strong>Pane ${index + 1}</strong><span>Chọn một tab đang mở hoặc bấm ＋ để mở thêm file.</span></div>`;
      pane.querySelector('.multi-pane-title').textContent = 'Chưa chọn file';
      pane.querySelector('.multi-pane-counter').textContent = '0 / 0';
      pane.querySelector('.multi-pane-prev').disabled = true;
      pane.querySelector('.multi-pane-next').disabled = true;
      return;
    }

    pane.classList.add('loading');
    try {
      const [doc] = await api.readPaths([paneState.path]);
      if (!doc || doc.error) throw new Error(doc?.error || 'Không đọc được file');
      paintPane(index, pane, modelFromDocument(doc));
    } catch (error) {
      pane.querySelector('.multi-pane-document').innerHTML = `<div class="multi-pane-error"><strong>Không đọc được tài liệu</strong><span>${escapeHtml(error.message || error)}</span></div>`;
      pane.querySelector('.multi-pane-title').textContent = 'Lỗi';
    } finally {
      pane.classList.remove('loading');
    }
  }

  async function movePaneChapter(index, delta) {
    const paneState = state.panes[index];
    if (!paneState.path) return;
    const pane = grid.querySelector(`.multi-pane[data-pane-index="${index}"]`);
    if (!pane) return;

    capturePaneScroll(index);
    let model = modelCache.get(paneState.path);
    if (!model) {
      const [doc] = await api.readPaths([paneState.path]);
      if (!doc || doc.error) return;
      model = modelFromDocument(doc);
    }

    const current = Number(paneState.chapters[paneState.path] || 0);
    paneState.chapters[paneState.path] = Math.min(Math.max(0, current + delta), model.chapters.length - 1);
    saveState();
    paintPane(index, pane, model);
  }

  function renderGrid() {
    captureAllScrolls();
    ensureAssignments();
    grid.className = `multi-view-grid layout-${state.layout}`;
    grid.innerHTML = '';

    for (let index = 0; index < state.layout; index += 1) {
      const pane = buildPaneShell(index);
      grid.appendChild(pane);
      renderPane(index, pane);
    }
  }

  function applyMode() {
    document.body.classList.toggle('multi-view-active', state.enabled);
    toggleBtn.classList.toggle('active', state.enabled);
    toggleBtn.textContent = state.enabled ? '▦ Multi View ON' : '▦ Multi View';
    layoutSelect.value = String(state.layout);
    stage.classList.toggle('hidden', !state.enabled);

    if (state.enabled) {
      renderGrid();
    } else {
      captureAllScrolls();
      const activeTab = tabsHost.querySelector('.tab.active');
      if (activeTab) setTimeout(() => activeTab.click(), 0);
    }

    saveState();
  }

  toggleBtn.addEventListener('click', () => {
    state.enabled = !state.enabled;
    applyMode();
    if (state.enabled && !getOpenTabs().length) setTimeout(() => openBtn.click(), 30);
  });

  layoutSelect.addEventListener('change', () => {
    captureAllScrolls();
    state.layout = [2, 3, 4].includes(Number(layoutSelect.value)) ? Number(layoutSelect.value) : 2;
    saveState();
    if (state.enabled) renderGrid();
  });

  modeSelect.addEventListener('change', () => {
    if (state.enabled) renderGrid();
  });

  const tabsObserver = new MutationObserver(() => {
    if (state.enabled) renderGrid();
  });
  tabsObserver.observe(tabsHost, { childList: true, subtree: true });

  api.onFileChanged((payload) => {
    if (!payload?.path) return;
    modelCache.delete(payload.path);
    if (!state.enabled) return;
    state.panes.slice(0, state.layout).forEach((paneState, index) => {
      if (paneState.path === payload.path) {
        const pane = grid.querySelector(`.multi-pane[data-pane-index="${index}"]`);
        if (pane && !payload.missing && !payload.error) renderPane(index, pane);
      }
    });
  });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'm') {
      event.preventDefault();
      toggleBtn.click();
    }
  });

  window.addEventListener('beforeunload', captureAllScrolls);
  applyMode();
})();
