const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

// Disable GPU initialization failures on older/virtualized Windows devices.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.setAppLogsPath(path.join(app.getPath('userData'), 'logs'));

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
  const selectedServerFile = path.join(app.getAppPath(), 'dist', 'server.cjs');
  if (!fs.existsSync(selectedServerFile)) {
    throw new Error(`ملف تشغيل النظام غير موجود: ${selectedServerFile}`);
  }

  const previousPort = process.env.PORT;
  const previousAppRoot = process.env.HAWR_APP_ROOT;
  const previousDataDir = process.env.HAWR_DATA_DIR;
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(PORT);
  process.env.HAWR_APP_ROOT = app.getAppPath();
  process.env.HAWR_DATA_DIR = path.join(app.getPath('userData'), 'data');
  try {
    const serverModule = require(selectedServerFile);
    serverProcess = await serverModule.startServer();
  } catch (error) {
    dialog.showErrorBox('تعذر تشغيل خدمة نظام معرض حور', error.message);
    app.quit();
    return;
  } finally {
    if (previousPort === undefined) delete process.env.PORT; else process.env.PORT = previousPort;
    if (previousAppRoot === undefined) delete process.env.HAWR_APP_ROOT; else process.env.HAWR_APP_ROOT = previousAppRoot;
    if (previousDataDir === undefined) delete process.env.HAWR_DATA_DIR; else process.env.HAWR_DATA_DIR = previousDataDir;
  }

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
    show: true,
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
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    win.show();
    dialog.showErrorBox('تعذر تحميل واجهة نظام معرض حور', `${errorCode}: ${errorDescription}`);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  try {
    await win.loadURL(`http://127.0.0.1:${PORT}`);
  } catch (error) {
    win.show();
    dialog.showErrorBox('تعذر تحميل واجهة نظام معرض حور', `${error.message}\n\nيمكن مراجعة سجل التشغيل داخل مجلد Logs الخاص بالبرنامج.`);
  }
}

process.on('uncaughtException', (error) => {
  dialog.showErrorBox('خطأ غير متوقع في نظام معرض حور', error.stack || error.message);
});
process.on('unhandledRejection', (error) => {
  dialog.showErrorBox('خطأ غير متوقع في نظام معرض حور', String(error));
});

app.whenReady().then(createWindow).catch((error) => {
  dialog.showErrorBox('تعذر بدء نظام معرض حور', error.stack || error.message);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (serverProcess) serverProcess.close();
});
app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
