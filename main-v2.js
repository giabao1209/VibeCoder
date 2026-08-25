const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const watchers = new Map();
let mainWindow = null;
let sessionWriteQueue = Promise.resolve();

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt', '.tex']);
const SESSION_FILE = 'reader-session.json';

function isReadableDocument(filePath) {
  return typeof filePath === 'string' && SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function getSessionPath() {
  return path.join(app.getPath('userData'), SESSION_FILE);
}

async function loadSessionState() {
  try {
    const raw = await fs.readFile(getSessionPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSessionState(session) {
  const target = getSessionPath();
  const tmp = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(session ?? {}, null, 2), 'utf8');
  await fs.rename(tmp, target);
  return true;
}

function queueSessionWrite(session) {
  const snapshot = JSON.parse(JSON.stringify(session ?? {}));
  sessionWriteQueue = sessionWriteQueue
    .catch(() => {})
    .then(() => writeSessionState(snapshot));
  return sessionWriteQueue;
}

async function readDocument(filePath) {
  if (!isReadableDocument(filePath)) throw new Error('Unsupported file type');

  const resolved = path.resolve(filePath);
  const [content, stat] = await Promise.all([
    fs.readFile(resolved, 'utf8'),
    fs.stat(resolved)
  ]);

  return {
    path: resolved,
    name: path.basename(resolved),
    content,
    mtimeMs: stat.mtimeMs
  };
}

async function readDocuments(paths) {
  const results = [];
  for (const filePath of paths) {
    try {
      results.push(await readDocument(filePath));
    } catch (error) {
      results.push({ path: filePath, error: error.message });
    }
  }
  return results;
}

function emitFileUpdate(filePath, type = 'changed') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (type === 'missing') {
    mainWindow.webContents.send('files:changed', { path: filePath, missing: true });
    return;
  }

  readDocument(filePath)
    .then((doc) => mainWindow.webContents.send('files:changed', doc))
    .catch((error) => {
      mainWindow.webContents.send('files:changed', { path: filePath, error: error.message });
    });
}

function watchDocument(filePath) {
  const resolved = path.resolve(filePath);
  if (watchers.has(resolved)) return;

  const watcher = chokidar.watch(resolved, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 120,
      pollInterval: 30
    }
  });

  watcher.on('change', () => emitFileUpdate(resolved));
  watcher.on('add', () => emitFileUpdate(resolved));
  watcher.on('unlink', () => emitFileUpdate(resolved, 'missing'));
  watcher.on('error', (error) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('files:changed', { path: resolved, error: error.message });
    }
  });

  watchers.set(resolved, watcher);
}

async function unwatchDocument(filePath) {
  const resolved = path.resolve(filePath);
  const watcher = watchers.get(resolved);
  if (!watcher) return;
  watchers.delete(resolved);
  await watcher.close();
}

function getInitialPaths(argv) {
  const offset = app.isPackaged ? 1 : 2;
  return argv
    .slice(offset)
    .filter((candidate) => isReadableDocument(candidate) && fsSync.existsSync(candidate))
    .map((candidate) => path.resolve(candidate));
}

function sendOpenPaths(paths) {
  if (!mainWindow || mainWindow.isDestroyed() || !paths.length) return;
  mainWindow.webContents.send('app:open-paths', paths);
}

function createWindow(initialPaths = []) {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 920,
    minHeight: 640,
    title: 'VibeReader',
    icon: path.join(__dirname, 'icon-512.png'),
    backgroundColor: '#0a0b16',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-safe.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.once('did-finish-load', () => sendOpenPaths(initialPaths));
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('files:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Markdown or LaTeX documents',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Readable documents', extensions: ['md', 'markdown', 'mdown', 'mkd', 'tex', 'txt'] },
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: 'LaTeX', extensions: ['tex'] },
      { name: 'Text', extensions: ['txt'] }
    ]
  });

  if (result.canceled) return [];
  return readDocuments(result.filePaths);
});

ipcMain.handle('files:read', async (_event, paths) => {
  if (!Array.isArray(paths)) return [];
  return readDocuments(paths.filter(isReadableDocument));
});

ipcMain.handle('files:watch', async (_event, paths) => {
  if (!Array.isArray(paths)) return false;
  paths.filter(isReadableDocument).forEach(watchDocument);
  return true;
});

ipcMain.handle('files:unwatch', async (_event, filePath) => {
  if (!isReadableDocument(filePath)) return false;
  await unwatchDocument(filePath);
  return true;
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  if (!/^(https?:|mailto:)/i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('session:load', async () => loadSessionState());
ipcMain.handle('session:save', async (_event, session) => {
  if (!session || typeof session !== 'object' || Array.isArray(session)) return false;
  await queueSessionWrite(session);
  return true;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const paths = getInitialPaths(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      sendOpenPaths(paths);
    }
  });

  app.whenReady().then(() => {
    createWindow(getInitialPaths(process.argv));
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (isReadableDocument(filePath)) sendOpenPaths([path.resolve(filePath)]);
});

app.on('before-quit', () => {
  for (const watcher of watchers.values()) watcher.close();
  watchers.clear();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
