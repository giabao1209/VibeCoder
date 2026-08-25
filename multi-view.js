(() => {
  try {
    const api = window.readerApi;
    const toggleBtn = document.getElementById('multiViewBtn');
    const layoutSelect = document.getElementById('multiLayoutSelect');
    const stage = document.getElementById('multiViewStage');
    const grid = document.getElementById('multiViewGrid');
    const openBtn = document.getElementById('openBtn');
    const modeSelect = document.getElementById('modeSelect');
    const tabsHost = document.getElementById('tabs');

    if (!api || !toggleBtn || !layoutSelect || !stage || !grid || !openBtn || !modeSelect) {
      throw new Error('Multi View UI or Electron bridge is unavailable');
    }

    const STORAGE_KEY = 'vibereader.multiview';
    const modelCache = new Map();

    function readJson(key, fallback = {}) {
      try { return JSON.parse(localStorage.getItem(key) || '') || fallback; }
      catch { return fallback; }
    }

    function normalizeState(saved = {}) {
      const layout = [2, 3, 4].includes(Number(saved.layout)) ? Number(saved.layout) : 2;
      const panes = Array.from({ length: 4 }, (_, i) => {
        const pane = Array.isArray(saved.panes) ? saved.panes[i] : null;
        return {
          path: typeof pane?.path === 'string' ? pane.path : null,
          chapter: Number.isFinite(Number(pane?.chapter)) ? Number(pane.chapter) : 0,
          scrolls: pane?.scrolls && typeof pane.scrolls === 'object' ? pane.scrolls : {}
        };
      });
      return { enabled: Boolean(saved.enabled), layout, panes };
    }

    const state = normalizeState(readJson(STORAGE_KEY, {}));

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('vibereader:multiview-state'));
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function fileFormat(filePath) {
      return /\.tex$/i.test(filePath || '') ? 'latex' : 'markdown';
    }

    function basename(filePath) {
      return String(filePath || '').split(/[\\/]/).pop() || 'Document';
    }

    function sessionPaths() {
      const session = readJson('vibereader.session', {});
      const paths = Array.isArray(session.paths) ? session.paths.filter((p) => typeof p === 'string' && p) : [];
      if (paths.length) return [...new Set(paths)];
      if (!tabsHost) return [];
      return [...new Set([...tabsHost.querySelectorAll('.tab')].map((tab) => tab.title?.trim()).filter(Boolean))];
    }

    function availableDocs() {
      const tabInfo = new Map();
      if (tabsHost) {
        for (const tab of tabsHost.querySelectorAll('.tab')) {
          const path = tab.title?.trim();
          if (!path) continue;
          tabInfo.set(path, {
            path,
            name: tab.querySelector('.tab-name')?.textContent?.trim() || basename(path),
            format: tab.querySelector('.tab-format')?.textContent?.trim() || (fileFormat(path) === 'latex' ? 'TEX' : 'MD')
          });
        }
      }
      return sessionPaths().map((path) => tabInfo.get(path) || {
        path,
        name: basename(path),
        format: fileFormat(path) === 'latex' ? 'TEX' : 'MD'
      });
    }

    function serializeNodes(nodes) {
      const wrapper = document.createElement('div');
      nodes.forEach((node) => wrapper.appendChild(node.cloneNode(true)));
      return wrapper.innerHTML;
    }

    function buildChapters(html, fallbackTitle) {
      const template = document.createElement('template');
      template.innerHTML = html || '';
      const nodes = [...template.content.childNodes];
      const chapters = [];
      let current = null;
      let intro = [];

      function pushIntro() {
        if (!intro.length) return;
        const chunk = serializeNodes(intro);
        if (chunk.trim()) chapters.push({ id: 'document-intro', title: 'Mở đầu', html: chunk });
        intro = [];
      }
      function pushCurrent() {
        if (!current) return;
        current.html = serializeNodes(current.nodes);
        delete current.nodes;
        chapters.push(current);
        current = null;
      }

      for (const node of nodes) {
        if (node.nodeType === 1 && node.tagName === 'H1') {
          pushIntro();
          pushCurrent();
          current = {
            id: node.id || `chapter-${chapters.length + 1}`,
            title: node.textContent.trim() || `Chương ${chapters.length + 1}`,
            nodes: [node]
          };
        } else if (current) current.nodes.push(node);
        else intro.push(node);
      }
      pushCurrent();
      pushIntro();

      if (!chapters.length) chapters.push({
        id: 'document-root',
        title: fallbackTitle.replace(/\.(md|markdown|mdown|mkd|txt|tex)$/i, ''),
        html: html || '<p class="empty-document-note">File này hiện chưa có nội dung.</p>'
      });
      return chapters;
    }

    function renderModel(doc) {
      const cached = modelCache.get(doc.path);
      if (cached && cached.mtimeMs === doc.mtimeMs) return cached;
      const rendered = fileFormat(doc.path) === 'latex'
        ? api.renderLatex(doc.content, doc.path)
        : api.renderMarkdown(doc.content, doc.path);
      const model = {
        path: doc.path,
        name: doc.name || basename(doc.path),
        format: rendered.format || fileFormat(doc.path),
        html: rendered.html,
        chapters: buildChapters(rendered.html, doc.name || basename(doc.path)),
        mtimeMs: doc.mtimeMs
      };
      modelCache.set(doc.path, model);
      return model;
    }

    function optionHtml(selectedPath) {
      const out = ['<option value="">— Chọn tài liệu —</option>'];
      for (const doc of availableDocs()) {
        out.push(`<option value="${escapeHtml(doc.path)}" ${doc.path === selectedPath ? 'selected' : ''}>${escapeHtml(doc.format)} · ${escapeHtml(doc.name)}</option>`);
      }
      return out.join('');
    }

    function ensureAssignments() {
      const paths = sessionPaths();
      const valid = new Set(paths);
      for (let i = 0; i < state.layout; i += 1) {
        if (state.panes[i].path && !valid.has(state.panes[i].path)) state.panes[i].path = null;
      }
      const used = new Set(state.panes.slice(0, state.layout).map((p) => p.path).filter(Boolean));
      const free = paths.filter((p) => !used.has(p));
      for (let i = 0; i < state.layout; i += 1) {
        if (!state.panes[i].path && free.length) state.panes[i].path = free.shift();
      }
      saveState();
    }

    function paneKey(index) {
      const pane = state.panes[index];
      return `${pane.path || ''}::${modeSelect.value || 'chapters'}::${pane.chapter || 0}`;
    }

    function captureScroll(index) {
      const paneState = state.panes[index];
      if (!paneState.path) return;
      const scroll = grid.querySelector(`.multi-pane[data-pane-index="${index}"] .multi-pane-scroll`);
      if (!scroll) return;
      paneState.scrolls[paneKey(index)] = Math.max(0, Math.round(scroll.scrollTop || 0));
    }

    function captureAllScrolls() {
      for (let i = 0; i < state.layout; i += 1) captureScroll(i);
      saveState();
    }

    function makePane(index) {
      const paneState = state.panes[index];
      const pane = document.createElement('section');
      pane.className = 'multi-pane';
      pane.dataset.paneIndex = String(index);
      pane.innerHTML = `
        <header class="multi-pane-header">
          <span class="multi-pane-number">${index + 1}</span>
          <select class="multi-pane-select">${optionHtml(paneState.path)}</select>
          <button class="multi-pane-open" title="Mở thêm tài liệu">＋</button>
        </header>
        <div class="multi-pane-scroll">
          <article class="markdown-document multi-pane-document"><div class="multi-pane-placeholder"><strong>Pane ${index + 1}</strong><span>Chọn tài liệu để đọc.</span></div></article>
        </div>
        <footer class="multi-pane-footer">
          <button class="multi-pane-prev">←</button>
          <span class="multi-pane-title">Chưa chọn file</span>
          <span class="multi-pane-counter">0 / 0</span>
          <button class="multi-pane-next">→</button>
        </footer>`;

      pane.querySelector('.multi-pane-select').addEventListener('change', (event) => {
        captureScroll(index);
        paneState.path = event.target.value || null;
        paneState.chapter = 0;
        saveState();
        renderPane(index, pane);
      });
      pane.querySelector('.multi-pane-open').addEventListener('click', () => openBtn.click());
      pane.querySelector('.multi-pane-prev').addEventListener('click', () => changeChapter(index, -1));
      pane.querySelector('.multi-pane-next').addEventListener('click', () => changeChapter(index, 1));
      pane.querySelector('.multi-pane-scroll').addEventListener('scroll', () => {
        captureScroll(index);
        saveState();
      }, { passive: true });
      return pane;
    }

    function paintPane(index, pane, model) {
      const paneState = state.panes[index];
      paneState.chapter = Math.min(Math.max(0, Number(paneState.chapter) || 0), model.chapters.length - 1);
      const chapter = model.chapters[paneState.chapter];
      const docEl = pane.querySelector('.multi-pane-document');
      docEl.classList.toggle('latex-mode', model.format === 'latex');
      docEl.classList.toggle('markdown-mode', model.format !== 'latex');
      docEl.innerHTML = modeSelect.value === 'continuous' ? model.html : chapter.html;
      docEl.style.setProperty('--chapter-hue', [286, 328, 18, 48, 174, 210, 248][paneState.chapter % 7]);
      pane.querySelector('.multi-pane-title').textContent = chapter.title || model.name;
      pane.querySelector('.multi-pane-counter').textContent = `${paneState.chapter + 1} / ${model.chapters.length}`;
      pane.querySelector('.multi-pane-prev').disabled = paneState.chapter <= 0;
      pane.querySelector('.multi-pane-next').disabled = paneState.chapter >= model.chapters.length - 1;
      saveState();
      const saved = Number(paneState.scrolls[paneKey(index)]);
      requestAnimationFrame(() => {
        const scroll = pane.querySelector('.multi-pane-scroll');
        scroll.scrollTop = Number.isFinite(saved) && saved >= 0 ? saved : 0;
      });
    }

    async function renderPane(index, pane = grid.querySelector(`.multi-pane[data-pane-index="${index}"]`)) {
      if (!pane) return;
      const paneState = state.panes[index];
      const select = pane.querySelector('.multi-pane-select');
      select.innerHTML = optionHtml(paneState.path);
      select.value = paneState.path || '';
      if (!paneState.path) {
        pane.querySelector('.multi-pane-document').innerHTML = `<div class="multi-pane-placeholder"><strong>Pane ${index + 1}</strong><span>Chọn một tài liệu hoặc bấm ＋.</span></div>`;
        pane.querySelector('.multi-pane-title').textContent = 'Chưa chọn file';
        pane.querySelector('.multi-pane-counter').textContent = '0 / 0';
        pane.querySelector('.multi-pane-prev').disabled = true;
        pane.querySelector('.multi-pane-next').disabled = true;
        return;
      }
      try {
        pane.classList.add('loading');
        const [doc] = await api.readPaths([paneState.path]);
        if (!doc || doc.error) throw new Error(doc?.error || 'Không đọc được file');
        paintPane(index, pane, renderModel(doc));
      } catch (error) {
        pane.querySelector('.multi-pane-document').innerHTML = `<div class="multi-pane-error"><strong>Không đọc được tài liệu</strong><span>${escapeHtml(error?.message || error)}</span></div>`;
        pane.querySelector('.multi-pane-title').textContent = 'Lỗi';
      } finally {
        pane.classList.remove('loading');
      }
    }

    async function changeChapter(index, delta) {
      const paneState = state.panes[index];
      if (!paneState.path) return;
      captureScroll(index);
      let model = modelCache.get(paneState.path);
      if (!model) {
        const [doc] = await api.readPaths([paneState.path]);
        if (!doc || doc.error) return;
        model = renderModel(doc);
      }
      paneState.chapter = Math.min(Math.max(0, paneState.chapter + delta), model.chapters.length - 1);
      saveState();
      paintPane(index, grid.querySelector(`.multi-pane[data-pane-index="${index}"]`), model);
    }

    function renderGrid() {
      captureAllScrolls();
      ensureAssignments();
      grid.className = `multi-view-grid layout-${state.layout}`;
      grid.replaceChildren();
      for (let i = 0; i < state.layout; i += 1) {
        const pane = makePane(i);
        grid.appendChild(pane);
        renderPane(i, pane);
      }
    }

    function applyMode() {
      document.body.classList.toggle('multi-view-active', state.enabled);
      toggleBtn.classList.toggle('active', state.enabled);
      toggleBtn.textContent = state.enabled ? '▦ Multi View ON' : '▦ Multi View';
      layoutSelect.value = String(state.layout);
      stage.classList.toggle('hidden', !state.enabled);
      if (state.enabled) renderGrid();
      else captureAllScrolls();
      saveState();
    }

    toggleBtn.addEventListener('click', () => {
      state.enabled = !state.enabled;
      applyMode();
      if (state.enabled && !sessionPaths().length) setTimeout(() => openBtn.click(), 50);
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

    if (tabsHost) {
      new MutationObserver(() => {
        if (state.enabled) renderGrid();
      }).observe(tabsHost, { childList: true });
    }

    api.onFileChanged((payload) => {
      if (!payload?.path) return;
      modelCache.delete(payload.path);
      if (!state.enabled) return;
      for (let i = 0; i < state.layout; i += 1) {
        if (state.panes[i].path === payload.path) renderPane(i);
      }
    });

    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        toggleBtn.click();
      }
    });
    window.addEventListener('beforeunload', captureAllScrolls);

    toggleBtn.dataset.ready = 'true';
    toggleBtn.title = 'Mở nhiều tài liệu cùng lúc · Ctrl+Shift+M · Ready';
    window.__vibeMultiViewReady = true;
    applyMode();
  } catch (error) {
    console.error('[VibeReader] Multi View failed to initialize:', error);
    const button = document.getElementById('multiViewBtn');
    if (button) {
      button.dataset.ready = 'false';
      button.textContent = '⚠ Multi View';
      button.title = `Multi View lỗi: ${error?.message || error}`;
    }
    window.__vibeMultiViewReady = false;
  }
})();
