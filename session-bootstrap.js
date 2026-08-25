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
    }
  } catch (error) {
    console.error('[VibeReader] Could not restore persisted session:', error);
  }

  const renderer = document.createElement('script');
  renderer.src = 'renderer-v2.js';
  renderer.onload = () => {
    const enhancer = document.createElement('script');
    enhancer.src = 'session-enhancer.js';
    document.body.appendChild(enhancer);
  };
  renderer.onerror = () => {
    console.error('[VibeReader] renderer-v2.js failed to load.');
  };
  document.body.appendChild(renderer);
})();
