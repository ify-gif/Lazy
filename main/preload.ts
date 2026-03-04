import { contextBridge, ipcRenderer } from 'electron';
import { AppStatus, StatusUpdate, UpdateEvent, Meeting, WorkStory, AIResponse, ActionItem, Thread, MeetingTemplate, TeamDevice, TeamTrustMode, LocalTeamProfile, LanPeer, TeamSharePacket, TeamShareEvent, TeamDiagnostics } from './types';

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
        summarizeMeeting: (transcript: string, template?: MeetingTemplate, previousSummary?: string): Promise<string> =>
            ipcRenderer.invoke('ai-summarize-meeting', { transcript, template, previousSummary }),
        generateStory: (overview: string): Promise<AIResponse> => ipcRenderer.invoke('ai-generate-story', overview),
        polishComment: (comment: string): Promise<string> => ipcRenderer.invoke('ai-polish-comment', comment),
        extractActionItems: (summary: string): Promise<ActionItem[]> => ipcRenderer.invoke('ai-extract-action-items', summary),
        generateStoryFromActionItem: (actionItem: string, meetingContext: string): Promise<AIResponse> =>
            ipcRenderer.invoke('ai-generate-story-from-action-item', { actionItem, meetingContext }),
    },
    db: {
        saveMeeting: (title: string, transcript: string, summary: string, threadId?: number): Promise<number> =>
            ipcRenderer.invoke('db-save-meeting', title, transcript, summary, threadId),
        updateMeetingThread: (meetingId: number, threadId: number | null): Promise<void> => ipcRenderer.invoke('db-update-meeting-thread', meetingId, threadId),
        getMeetings: (): Promise<Meeting[]> => ipcRenderer.invoke('db-get-meetings'),
        getThreads: (): Promise<Thread[]> => ipcRenderer.invoke('db-get-threads'),
        saveThread: (name: string): Promise<number> => ipcRenderer.invoke('db-save-thread', name),
        getMeetingsByThread: (threadId: number): Promise<Meeting[]> => ipcRenderer.invoke('db-get-meetings-by-thread', threadId),
        saveWorkStory: (type: 'story' | 'comment', overview: string, output: string, parentId?: number, title?: string, sourceMeetingId?: number): Promise<number> =>
            ipcRenderer.invoke('db-save-work-story', { type, title, overview, output, parentId, sourceMeetingId }),
        getWorkStories: (): Promise<WorkStory[]> => ipcRenderer.invoke('db-get-work-stories'),
        getComments: (storyId: number): Promise<WorkStory[]> => ipcRenderer.invoke('db-get-comments', storyId),
        updateWorkStoryTitle: (id: number, title: string): Promise<void> => ipcRenderer.invoke('db-update-work-story-title', { id, title }),
        deleteThread: (threadId: number): Promise<void> => ipcRenderer.invoke('db-delete-thread', threadId),
        deleteItem: (table: 'meetings' | 'work_stories', id: number): Promise<void> => ipcRenderer.invoke('db-delete-item', { table, id }),
        getTeamDevices: (): Promise<TeamDevice[]> => ipcRenderer.invoke('db-get-team-devices'),
        saveTeamDevice: (deviceName: string, pairingCode: string): Promise<TeamDevice> =>
            ipcRenderer.invoke('db-save-team-device', { deviceName, pairingCode }),
        updateTeamDeviceTrustMode: (deviceId: string, trustMode: TeamTrustMode): Promise<void> =>
            ipcRenderer.invoke('db-update-team-device-trust-mode', { deviceId, trustMode }),
        deleteTeamDevice: (deviceId: string): Promise<void> => ipcRenderer.invoke('db-delete-team-device', { deviceId }),
    },
    team: {
        getLocalProfile: (): Promise<LocalTeamProfile> => ipcRenderer.invoke('team-get-local-profile'),
        setLocalDeviceName: (name: string): Promise<LocalTeamProfile> => ipcRenderer.invoke('team-set-local-device-name', name),
        getPeers: (): Promise<LanPeer[]> => ipcRenderer.invoke('team-get-peers'),
        scanPeers: (): Promise<LanPeer[]> => ipcRenderer.invoke('team-scan-peers'),
        getDiagnostics: (): Promise<TeamDiagnostics> => ipcRenderer.invoke('team-get-diagnostics'),
        sendShare: (peerDeviceId: string, packet: TeamSharePacket): Promise<void> =>
            ipcRenderer.invoke('team-send-share', { peerDeviceId, packet }),
        onEvent: (callback: (event: TeamShareEvent) => void) => {
            const subscription = (_event: unknown, event: TeamShareEvent) => callback(event);
            ipcRenderer.on('team-share-event', subscription);
            return () => ipcRenderer.removeListener('team-share-event', subscription);
        },
    },
    platform: process.platform
});
