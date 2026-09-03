const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const PORT = 3417;
let serverProcess;

function copySeedDatabase() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  const dbFile = path.join(dataDir, 'hawr-gallery.sqlite');
  if (fs.existsSync(dbFile)) return;
  fs.mkdirSync(dataDir, { recursive: true });
  const seed = app.isPackaged
    ? path.join(process.resourcesPath, 'data', 'hawr-gallery.sqlite')
    : path.join(__dirname, '..', 'data', 'hawr-gallery.sqlite');
  if (fs.existsSync(seed)) fs.copyFileSync(seed, dbFile);
}

function waitForServer(url, timeout = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on('error', () => {
        if (Date.now() - started > timeout) reject(new Error('تعذر تشغيل خدمة النظام المحلية'));
        else setTimeout(check, 150);
      });
      request.setTimeout(1000, () => request.destroy());
    };
    check();
  });
}

async function createWindow() {
  copySeedDatabase();
  const appRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  const serverFile = path.join(appRoot, 'app.asar', 'dist', 'server.cjs').replace('app.asar/app.asar', 'app.asar');
  const fallbackServerFile = path.join(app.getAppPath(), 'dist', 'server.cjs');
  const selectedServerFile = fs.existsSync(serverFile) ? serverFile : fallbackServerFile;

  const logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = fs.openSync(path.join(logDir, 'server.log'), 'a');
  serverProcess = spawn(process.execPath, [selectedServerFile], {
    cwd: appRoot,
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(PORT),
      HAWR_APP_ROOT: app.getAppPath(),
      HAWR_DATA_DIR: path.join(app.getPath('userData'), 'data'),
    },
    stdio: ['ignore', logFile, logFile],
  });
  serverProcess.on('error', (error) => {
    dialog.showErrorBox('تعذر تشغيل خدمة نظام معرض حور', error.message);
  });

  try {
    await waitForServer(`http://127.0.0.1:${PORT}/api/system/status`);
  } catch (error) {
    dialog.showErrorBox('تعذر تشغيل نظام معرض حور', error.message);
    app.quit();
    return;
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'نظام إدارة معرض حور',
    backgroundColor: '#f1f5f9',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
