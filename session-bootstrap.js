(async () => {
  const api = window.readerApi;

  if (!api) {
    console.error('[VibeReader] Electron bridge unavailable before renderer startup.');
    const badge = document.getElementById('updateBadge');
    if (badge) {
      badge.textContent = 'Electron bridge lỗi';
      badge.dataset.tone = 'danger';
    }
    return;
  }

  try {
    const disk = await api.loadSession();
    if (disk && typeof disk === 'object') {
      if (disk.session && typeof disk.session === 'object') {
        localStorage.setItem('vibereader.session', JSON.stringify(disk.session));
      }
      if (typeof disk.mode === 'string') localStorage.setItem('vibereader.mode', disk.mode);
      if (typeof disk.theme === 'string') localStorage.setItem('vibereader.theme', disk.theme);
      if (typeof disk.sidebar === 'string') localStorage.setItem('vibereader.sidebar', disk.sidebar);
      if (disk.scrolls && typeof disk.scrolls === 'object') {
        localStorage.setItem('vibereader.scrolls', JSON.stringify(disk.scrolls));
      }
      if (disk.multiview && typeof disk.multiview === 'object') {
        localStorage.setItem('vibereader.multiview', JSON.stringify(disk.multiview));
      }
    }
  } catch (error) {
    console.error('[VibeReader] Could not restore persisted session:', error);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`${src} failed to load`));
      document.body.appendChild(script);
    });
  }

  try {
    await loadScript('renderer-v2.js');
    await loadScript('session-enhancer.js');
    await loadScript('multi-view.js');
  } catch (error) {
    console.error('[VibeReader] Renderer startup failed:', error);
  }
})();
