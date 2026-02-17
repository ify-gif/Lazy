import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

// ESM-style imports are allowed in 'NodeNext' if we stick to CJS output limits or use .mts
// But for simplicity with Electron + NodeNext (CJS default), we just use __dirname.

let mainWindow: BrowserWindow | null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 800,
        minHeight: 600,
        title: "LAZY",
        icon: path.join(__dirname, '../public/app_icon_square.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true, // Hide default menu bar
        frame: false, // Frameless to match previous design
        titleBarStyle: 'hidden', // Optional but good for custom controls
        show: false,
    });

    const dev = !app.isPackaged;
    // In production, the file is in resources/app/out/index.html
    // main.js is in resources/app/dist-electron/main.js
    // So distinct-electron/../out/index.html is correct.
    const appUrl = dev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../out/index.html')}`;

    console.log(`Loading URL: ${appUrl}`);
    mainWindow.loadURL(appUrl);

    mainWindow.once('ready-to-show', () => {
        if (mainWindow) mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Window Controls - Moved outside createWindow to prevent duplicate listeners
ipcMain.on('window-minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.minimize();
});

ipcMain.on('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) {
        win.unmaximize();
    } else {
        win?.maximize();
    }
});

ipcMain.on('window-close', () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.close();
});

// Settings Management
import { Store } from './store';

ipcMain.on('set-api-key', (_event, key) => {
    Store.setApiKey(key);
});

ipcMain.handle('get-api-key', () => {
    return Store.getApiKey();
});

ipcMain.on('set-setting', (_event, { key, value }) => {
    Store.set(key, value);
});

ipcMain.handle('get-setting', (_event, key) => {
    return Store.get(key);
});

// AI Service
import { AIService } from './aiService';

// Database Service
import { DBService } from './dbService';
DBService.init();

// Auto Updater
import { autoUpdater } from 'electron-updater';

// Configure Auto Updater
autoUpdater.autoDownload = false; // We want manual download
autoUpdater.allowPrerelease = true; // Optional, but good for testing

// Map Update Events to Global Status
autoUpdater.on('checking-for-update', () => {
    broadcastStatus('processing', 'Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
    broadcastStatus('ready', `Update v${info.version} available`);
    // Send specifically for the Update Pill
    broadcastUpdateEvent('update-available', info);
});

autoUpdater.on('update-not-available', () => {
    broadcastStatus('ready', 'App is up to date');
    broadcastUpdateEvent('update-not-available');
});

autoUpdater.on('error', (err) => {
    broadcastStatus('error', `Update error: ${err.message}`);
    broadcastUpdateEvent('error', err.message);
});

autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.floor(progressObj.percent);
    broadcastStatus('processing', `Downloading: ${percent}%`);
    broadcastUpdateEvent('download-progress', percent);
});

autoUpdater.on('update-downloaded', () => {
    broadcastStatus('ready', 'Update ready to install');
    broadcastUpdateEvent('update-downloaded');
});

function broadcastStatus(status: string, message: string) {
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('app-status-update', { status, message });
    });
}

function broadcastUpdateEvent(event: string, data?: any) {
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('app-update-event', { event, data });
    });
}

// Update Handlers
ipcMain.handle('app-check-update', async () => {
    return await autoUpdater.checkForUpdates();
});

ipcMain.handle('app-download-update', async () => {
    return await autoUpdater.downloadUpdate();
});

ipcMain.on('app-install-update', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.handle('ai-transcribe', async (_event, arrayBuffer: ArrayBuffer) => {
    const buffer = Buffer.from(arrayBuffer);
    return await AIService.transcribe(buffer);
});

ipcMain.handle('ai-summarize-meeting', async (_event, transcript: string) => {
    return await AIService.summarizeMeeting(transcript);
});

ipcMain.handle('ai-generate-story', async (_event, overview: string) => {
    return await AIService.generateStory(overview);
});

ipcMain.handle('ai-polish-comment', async (_event, comment: string) => {
    return await AIService.polishComment(comment);
});

ipcMain.handle('ai-validate-key', async (_event, apiKey: string) => {
    return await AIService.validateKey(apiKey);
});

// DB Handlers
ipcMain.handle('db-save-meeting', async (_event, { title, transcript, summary }) => {
    return await DBService.saveMeeting(title, transcript, summary);
});

ipcMain.handle('db-get-meetings', async () => {
    return await DBService.getMeetings();
});

ipcMain.handle('db-save-work-story', async (_event, { type, overview, output, parentId }) => {
    return await DBService.saveWorkStory(type, overview, output, parentId);
});

ipcMain.handle('db-get-work-stories', async () => {
    return await DBService.getWorkStories();
});

ipcMain.handle('db-get-comments', async (_event, storyId) => {
    return await DBService.getCommentsHelper(storyId);
});

ipcMain.handle('db-delete-item', async (_event, { table, id }) => {
    return await DBService.deleteItem(table, id);
});

ipcMain.on('app-status-update', (_event, { status, message }) => {
    broadcastStatus(status, message);
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

app.whenReady().then(() => {
    createWindow();

    // Check for updates on startup
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => {
            console.error("Initial update check failed", err);
        });
    }, 3000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
