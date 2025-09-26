const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');

// Fix macOS secure coding warning by disabling restorable state
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
}

let mainWindow;
let currentPdfPath = null;
let watcher = null;
let crispMode = true;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    titleBarStyle: 'default'
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    if (watcher) {
      watcher.close();
    }
    mainWindow = null;
  });
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open PDF',
          accelerator: 'CmdOrCtrl+O',
          click: openPdfFile
        },
        {
          label: 'Reload PDF',
          accelerator: 'CmdOrCtrl+R',
          click: reloadPdf,
          enabled: false
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => mainWindow.webContents.send('zoom-in')
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow.webContents.send('zoom-out')
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.send('reset-zoom')
        },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen())
        },
        { type: 'separator' },
        {
          label: 'Crisp Mode (disable recolor filters)',
          type: 'checkbox',
          checked: crispMode,
          click: (item) => {
            crispMode = item.checked;
            if (mainWindow) {
              mainWindow.webContents.send('set-sharp-mode', crispMode);
            }
          }
        }
      ]
    },
    {
      label: 'Color Scheme',
      submenu: [
        {
          label: 'Light Theme',
          click: () => mainWindow.webContents.send('set-theme', 'light')
        },
        {
          label: 'Dark Theme',
          click: () => mainWindow.webContents.send('set-theme', 'dark')
        },
        {
          label: 'Sepia Theme',
          click: () => mainWindow.webContents.send('set-theme', 'sepia')
        },
        {
          label: 'Custom Colors',
          click: () => mainWindow.webContents.send('open-color-picker')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function openPdfFile() {
  dialog.showOpenDialog(mainWindow, {
    title: 'Open PDF File',
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      loadPdfFile(result.filePaths[0]);
    }
  });
}

function loadPdfFile(filePath) {
  currentPdfPath = filePath;
  
  // Stop existing watcher
  if (watcher) {
    watcher.close();
  }
  
  // Start watching the file for changes
  watcher = chokidar.watch(filePath, {
    persistent: true,
    ignoreInitial: true
  });
  
  watcher.on('change', () => {
    console.log('PDF file changed, reloading...');
    mainWindow.webContents.send('pdf-file-changed', filePath);
  });
  
  // Send file to renderer
  mainWindow.webContents.send('load-pdf', filePath);
  
  // Update menu
  const menu = Menu.getApplicationMenu();
  const reloadItem = menu.items[0].submenu.items[1];
  reloadItem.enabled = true;
}

function reloadPdf() {
  if (currentPdfPath) {
    loadPdfFile(currentPdfPath);
  }
}

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createMenu();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-pdf-info', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      modified: stats.mtime,
      path: filePath
    };
  } catch (error) {
    console.error('Error getting PDF info:', error);
    return null;
  }
});

ipcMain.handle('show-open-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open PDF File',
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    return result;
  } catch (error) {
    console.error('Error in show-open-dialog:', error);
    return { canceled: true, filePaths: [] };
  }
});