import { contextBridge, ipcRenderer } from 'electron';
import { AppStatus, StatusUpdate, UpdateEvent, Meeting, WorkStory, AIResponse } from './types';

contextBridge.exposeInMainWorld('electron', {
    windowControls: {
        minimize: () => ipcRenderer.send('window-minimize'),
        maximize: () => ipcRenderer.send('window-maximize'),
        close: () => ipcRenderer.send('window-close'),
    },
    settings: {
        setApiKey: (key: string) => ipcRenderer.send('set-api-key', key),
        getApiKey: (): Promise<string> => ipcRenderer.invoke('get-api-key'),
        set: (key: string, value: string) => ipcRenderer.send('set-setting', { key, value }),
        get: (key: string): Promise<string> => ipcRenderer.invoke('get-setting', key),
        getVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
        sendStatus: (status: AppStatus, message?: string) => ipcRenderer.send('app-status-update', { status, message }),
        onStatusChange: (callback: (data: StatusUpdate) => void) => {
            const subscription = (_event: unknown, data: StatusUpdate) => callback(data);
            ipcRenderer.on('app-status-update', subscription);
            return () => ipcRenderer.removeListener('app-status-update', subscription);
        },
        validateApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('ai-validate-key', key),
    },
    updates: {
        check: () => ipcRenderer.invoke('app-check-update'),
        download: () => ipcRenderer.invoke('app-download-update'),
        install: () => ipcRenderer.send('app-install-update'),
        onUpdateEvent: (callback: (data: UpdateEvent) => void) => {
            const subscription = (_event: unknown, data: UpdateEvent) => callback(data);
            ipcRenderer.on('app-update-event', subscription);
            return () => ipcRenderer.removeListener('app-update-event', subscription);
        },
    },
    ai: {
        transcribe: (buffer: ArrayBuffer): Promise<string> => ipcRenderer.invoke('ai-transcribe', buffer),
        summarizeMeeting: (transcript: string): Promise<string> => ipcRenderer.invoke('ai-summarize-meeting', transcript),
        generateStory: (overview: string): Promise<AIResponse> => ipcRenderer.invoke('ai-generate-story', overview),
        polishComment: (comment: string): Promise<string> => ipcRenderer.invoke('ai-polish-comment', comment),
    },
    db: {
        saveMeeting: (title: string, transcript: string, summary: string): Promise<number> => ipcRenderer.invoke('db-save-meeting', { title, transcript, summary }),
        getMeetings: (): Promise<Meeting[]> => ipcRenderer.invoke('db-get-meetings'),
        saveWorkStory: (type: 'story' | 'comment', overview: string, output: string, parentId?: number, title?: string): Promise<number> =>
            ipcRenderer.invoke('db-save-work-story', { type, title, overview, output, parentId }),
        getWorkStories: (): Promise<WorkStory[]> => ipcRenderer.invoke('db-get-work-stories'),
        getComments: (storyId: number): Promise<WorkStory[]> => ipcRenderer.invoke('db-get-comments', storyId),
        updateWorkStoryTitle: (id: number, title: string): Promise<void> => ipcRenderer.invoke('db-update-work-story-title', { id, title }),
        deleteItem: (table: 'meetings' | 'work_stories', id: number): Promise<void> => ipcRenderer.invoke('db-delete-item', { table, id }),
    },
    platform: process.platform
});
