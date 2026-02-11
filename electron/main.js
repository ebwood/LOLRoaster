const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

// Start the Express/WS server
const server = require('../src/index.js');

const DEFAULT_PORT = process.env.PORT || 8099;
let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    title: 'LoL Proxy - AI Coach',
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Retry loading if server isn't ready yet
  const loadApp = () => {
    const port = server.actualPort || DEFAULT_PORT;
    mainWindow.loadURL(`http://localhost:${port}`).catch(() => {
      setTimeout(loadApp, 1000);
    });
  };

  loadApp();

  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(loadApp, 1000);
  });

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of quitting
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Use a simple 16x16 tray icon
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAsklEQVR4nGNgGLTgPwMDAwMjIyPD////GRgYGBj+//9P0ABGIC0tLc3AwMDAICUlxfD//38GBgYGhv8MDAxQA5gYiABMUAOAgaQwIGoUMzMzEyGD/v8HuQakGWgAM9IALI6JKoYFkGwACzMzM2kGsLCwMBM0gJWVlRljABszMzPBAFBgZcabDlhYWBgYGBgY2NjYGPAZwA51AwMDAwM7OzsDPgOYoW5gYGBg4ODgYAAA7Eo5R3rvJSsAAAAASUVORK5CYII='
  );

  tray = new Tray(icon);
  tray.setToolTip('LoL Proxy - AI Coach');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
