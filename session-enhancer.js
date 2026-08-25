(() => {
  const api = window.readerApi;
  const readerScroll = document.getElementById('readerScroll');
  const documentPath = document.getElementById('documentPath');
  const pageCounter = document.getElementById('pageCounter');
  const modeSelect = document.getElementById('modeSelect');
  const markdownDocument = document.getElementById('markdownDocument');

  if (!api || !readerScroll || !documentPath || !pageCounter || !modeSelect || !markdownDocument) return;

  let scrolls = {};
  let dirty = false;
  let saveTimer = null;
  let restoreTimer = null;

  try {
    scrolls = JSON.parse(localStorage.getItem('vibereader.scrolls') || '{}') || {};
  } catch {
    scrolls = {};
  }

  function currentKey() {
    const path = documentPath.textContent.trim();
    if (!path) return null;
    const mode = modeSelect.value || 'chapters';
    const page = pageCounter.textContent.trim() || '0 / 0';
    return `${path}::${mode}::${page}`;
  }

  function captureScroll() {
    const key = currentKey();
    if (!key) return;
    scrolls[key] = Math.max(0, Math.round(readerScroll.scrollTop || 0));
    localStorage.setItem('vibereader.scrolls', JSON.stringify(scrolls));
    dirty = true;
  }

  function buildDiskSnapshot() {
    let session = {};
    try {
      session = JSON.parse(localStorage.getItem('vibereader.session') || '{}') || {};
    } catch {
      session = {};
    }

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      session,
      mode: localStorage.getItem('vibereader.mode') || 'chapters',
      theme: localStorage.getItem('vibereader.theme') || 'aurora',
      sidebar: localStorage.getItem('vibereader.sidebar') || 'open',
      scrolls
    };
  }

  function persistNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    dirty = false;
    api.saveSession(buildDiskSnapshot()).catch((error) => {
      console.error('[VibeReader] Failed to persist reader state:', error);
      dirty = true;
    });
  }

  function schedulePersist(delay = 160) {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, delay);
  }

  function restoreScrollSoon() {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      const key = currentKey();
      if (!key) return;
      const value = Number(scrolls[key]);
      if (Number.isFinite(value) && value >= 0) readerScroll.scrollTop = value;
    }, 40);
  }

  readerScroll.addEventListener('scroll', () => {
    captureScroll();
    schedulePersist(220);
  }, { passive: true });

  document.addEventListener('click', () => {
    setTimeout(() => {
      schedulePersist(0);
      restoreScrollSoon();
    }, 0);
  }, true);

  document.addEventListener('change', () => {
    setTimeout(() => {
      schedulePersist(0);
      restoreScrollSoon();
    }, 0);
  }, true);

  const observer = new MutationObserver(() => {
    restoreScrollSoon();
    schedulePersist(120);
  });

  observer.observe(documentPath, { childList: true, characterData: true, subtree: true });
  observer.observe(pageCounter, { childList: true, characterData: true, subtree: true });
  observer.observe(markdownDocument, { childList: true });

  window.addEventListener('blur', () => {
    captureScroll();
    schedulePersist(0);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      captureScroll();
      persistNow();
    }
  });

  window.addEventListener('beforeunload', () => {
    captureScroll();
    persistNow();
  });

  setInterval(() => {
    if (dirty) persistNow();
  }, 1000);

  restoreScrollSoon();
  schedulePersist(0);
})();
