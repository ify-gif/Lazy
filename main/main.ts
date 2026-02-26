import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { logger } from './logger';

// ESM-style imports are allowed in 'NodeNext' if we stick to CJS output limits or use .mts
// But for simplicity with Electron + NodeNext (CJS default), we just use __dirname.

let mainWindow: BrowserWindow | null;
let staticServer: http.Server | null = null;

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
};

function isSafePath(baseDir: string, targetPath: string): boolean {
    const normalizedBase = path.resolve(baseDir);
    const normalizedTarget = path.resolve(targetPath);
    return normalizedTarget.startsWith(normalizedBase);
}

function resolveStaticPath(outDir: string, requestPath: string): string {
    if (requestPath === '/') {
        return path.join(outDir, 'index.html');
    }

    const cleanedPath = requestPath.replace(/^\/+/, '');
    const directPath = path.join(outDir, cleanedPath);

    if (path.extname(cleanedPath)) {
        return directPath;
    }

    const directoryIndex = path.join(outDir, cleanedPath, 'index.html');
    if (fs.existsSync(directoryIndex)) {
        return directoryIndex;
    }

    const htmlFile = `${directPath}.html`;
    if (fs.existsSync(htmlFile)) {
        return htmlFile;
    }

    return directPath;
}

async function startStaticServer(outDir: string): Promise<string> {
    if (staticServer) {
        const address = staticServer.address();
        if (address && typeof address === 'object') {
            return `http://127.0.0.1:${address.port}`;
        }
    }

    staticServer = http.createServer((req, res) => {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const filePath = resolveStaticPath(outDir, urlPath);

        if (!isSafePath(outDir, filePath)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        if (!fs.existsSync(filePath)) {
            const fallback404 = path.join(outDir, '404.html');
            if (fs.existsSync(fallback404)) {
                const fallbackContent = fs.readFileSync(fallback404);
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(fallbackContent);
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });

    return await new Promise((resolve, reject) => {
        staticServer?.once('error', reject);
        staticServer?.listen(0, '127.0.0.1', () => {
            const address = staticServer?.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Unable to get static server address'));
                return;
            }
            resolve(`http://127.0.0.1:${address.port}`);
        });
    });
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 850,
        minWidth: 1024,
        minHeight: 768,
        title: "LAZY",
        icon: path.join(__dirname, '../public/app_icon_new.ico'),
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
    const appUrl = dev
        ? 'http://localhost:3000'
        : await startStaticServer(path.join(__dirname, '../out'));

    logger.info(`Loading URL: ${appUrl}`);
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
void DBService.init().catch((err) => {
    logger.error('DB initialization failed', err);
});

// Auto Updater
import { autoUpdater } from 'electron-updater';

// Configure Auto Updater
autoUpdater.autoDownload = false; // We want manual download
autoUpdater.allowPrerelease = true; // Optional, but good for testing

// Map Update Events to Global Status
autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for updates...');
    broadcastStatus('processing', 'Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
    logger.info(`Update v${info.version} available`);
    if (info.version) {
        Store.set('pendingReleaseNotesVersion', info.version);
    }
    broadcastStatus('ready', `Update v${info.version} available`);
    // Send specifically for the Update Pill
    broadcastUpdateEvent('update-available', info);
});

autoUpdater.on('update-not-available', () => {
    logger.info('App is up to date');
    broadcastStatus('ready', 'App is up to date');
    broadcastUpdateEvent('update-not-available');
});

autoUpdater.on('error', (err) => {
    logger.error(`Update error: ${err.message}`);
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

import { StatusUpdate, UpdateEvent } from './types';

function broadcastStatus(status: StatusUpdate['status'], message: string) {
    BrowserWindow.getAllWindows().forEach(win => {
        const update: StatusUpdate = { status, message };
        win.webContents.send('app-status-update', update);
    });
}

function broadcastUpdateEvent(event: string, data?: unknown) {
    BrowserWindow.getAllWindows().forEach(win => {
        const updateEvent: UpdateEvent = { event, data };
        win.webContents.send('app-update-event', updateEvent);
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

ipcMain.handle('db-save-work-story', async (_event, { type, title, overview, output, parentId }) => {
    return await DBService.saveWorkStory(type, overview, output, parentId, title);
});

ipcMain.handle('db-get-work-stories', async () => {
    return await DBService.getWorkStories();
});

ipcMain.handle('db-get-comments', async (_event, storyId) => {
    return await DBService.getCommentsHelper(storyId);
});

ipcMain.handle('db-update-work-story-title', async (_event, { id, title }) => {
    return await DBService.updateWorkStoryTitle(id, title);
});

ipcMain.handle('db-delete-item', async (_event, { table, id }) => {
    if (table !== 'meetings' && table !== 'work_stories') {
        throw new Error('Invalid table name');
    }
    return await DBService.deleteItem(table, id);
});

ipcMain.on('app-status-update', (_event, { status, message }) => {
    broadcastStatus(status, message);
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

app.whenReady().then(async () => {
    await createWindow();

    // Check for updates periodically (every hour)
    const CHECK_INTERVAL = 1000 * 60 * 60; // 60 minutes
    setInterval(() => {
        autoUpdater.checkForUpdates().catch(err => {
            logger.error("Periodic update check failed", err);
        });
    }, CHECK_INTERVAL);

    // Initial check on startup
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => {
            logger.error("Initial update check failed", err);
        });
    }, 3000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
});

app.on('window-all-closed', () => {
    staticServer?.close();
    staticServer = null;
    if (process.platform !== 'darwin') app.quit();
});
