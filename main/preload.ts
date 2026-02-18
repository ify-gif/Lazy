import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        send: (channel: string, data: any) => ipcRenderer.send(channel, data),
        on: (channel: string, func: (...args: any[]) => void) => {
            const subscription = (_event: any, ...args: any[]) => func(...args);
            ipcRenderer.on(channel, subscription);
            return () => ipcRenderer.removeListener(channel, subscription);
        },
        invoke: (channel: string, data: any) => ipcRenderer.invoke(channel, data),
    },
    windowControls: {
        minimize: () => ipcRenderer.send('window-minimize'),
        maximize: () => ipcRenderer.send('window-maximize'),
        close: () => ipcRenderer.send('window-close'),
    },
    settings: {
        setApiKey: (key: string) => ipcRenderer.send('set-api-key', key),
        getApiKey: () => ipcRenderer.invoke('get-api-key'),
        set: (key: string, value: string) => ipcRenderer.send('set-setting', { key, value }),
        get: (key: string) => ipcRenderer.invoke('get-setting', key),
        getVersion: () => ipcRenderer.invoke('get-app-version'),
        sendStatus: (status: 'ready' | 'recording' | 'processing' | 'error', message?: string) => ipcRenderer.send('app-status-update', { status, message }),
        onStatusChange: (callback: (data: { status: string, message?: string }) => void) => {
            const subscription = (_event: any, data: any) => callback(data);
            ipcRenderer.on('app-status-update', subscription);
            return () => ipcRenderer.removeListener('app-status-update', subscription);
        },
        validateApiKey: (key: string) => ipcRenderer.invoke('ai-validate-key', key),
    },
    updates: {
        check: () => ipcRenderer.invoke('app-check-update'),
        download: () => ipcRenderer.invoke('app-download-update'),
        install: () => ipcRenderer.send('app-install-update'),
        onUpdateEvent: (callback: (data: { event: string, data?: any }) => void) => {
            const subscription = (_event: any, data: any) => callback(data);
            ipcRenderer.on('app-update-event', subscription);
            return () => ipcRenderer.removeListener('app-update-event', subscription);
        },
    },
    ai: {
        transcribe: (buffer: ArrayBuffer) => ipcRenderer.invoke('ai-transcribe', buffer),
        summarizeMeeting: (transcript: string) => ipcRenderer.invoke('ai-summarize-meeting', transcript),
        generateStory: (overview: string) => ipcRenderer.invoke('ai-generate-story', overview),
        polishComment: (comment: string) => ipcRenderer.invoke('ai-polish-comment', comment),
    },
    db: {
        saveMeeting: (title: string, transcript: string, summary: string) => ipcRenderer.invoke('db-save-meeting', { title, transcript, summary }),
        getMeetings: () => ipcRenderer.invoke('db-get-meetings'),
        saveWorkStory: (type: 'story' | 'comment', overview: string, output: string, parentId?: number) => ipcRenderer.invoke('db-save-work-story', { type, overview, output, parentId }),
        getWorkStories: () => ipcRenderer.invoke('db-get-work-stories'),
        getComments: (storyId: number) => ipcRenderer.invoke('db-get-comments', storyId),
        deleteItem: (table: 'meetings' | 'work_stories', id: number) => ipcRenderer.invoke('db-delete-item', { table, id }),
    },
    platform: process.platform
});
