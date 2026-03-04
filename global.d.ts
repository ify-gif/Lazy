import { AppStatus, StatusUpdate, UpdateEvent, Meeting, WorkStory, AIResponse, ActionItem, Thread, MeetingTemplate, TeamDevice, TeamTrustMode, LocalTeamProfile, LanPeer, TeamSharePacket, TeamShareEvent } from './main/types';
declare global {
    interface Window {
        electron: {
            windowControls: {
                minimize: () => void;
                maximize: () => void;
                close: () => void;
            };
            settings: {
                setApiKey: (key: string) => void;
                getApiKey: () => Promise<string>;
                set: (key: string, value: string) => void;
                get: (key: string) => Promise<string>;
                getVersion: () => Promise<string>;
                sendStatus: (status: AppStatus, message?: string) => void;
                onStatusChange: (callback: (data: StatusUpdate) => void) => () => void;
                validateApiKey: (key: string) => Promise<boolean>;
            };
            updates: {
                check: () => Promise<unknown>;
                download: () => Promise<unknown>;
                install: () => void;
                onUpdateEvent: (callback: (data: UpdateEvent) => void) => () => void;
            };
            ai: {
                transcribe: (buffer: ArrayBuffer) => Promise<string>;
                summarizeMeeting: (transcript: string, template?: MeetingTemplate, previousSummary?: string) => Promise<string>;
                generateStory: (overview: string) => Promise<AIResponse>;
                polishComment: (comment: string) => Promise<string>;
                extractActionItems: (summary: string) => Promise<ActionItem[]>;
                generateStoryFromActionItem: (actionItem: string, meetingContext: string) => Promise<AIResponse>;
            };
            db: {
                saveMeeting: (title: string, transcript: string, summary: string, threadId?: number) => Promise<number>;
                updateMeetingThread: (meetingId: number, threadId: number | null) => Promise<void>;
                getMeetings: () => Promise<Meeting[]>;
                getThreads: () => Promise<Thread[]>;
                saveThread: (name: string) => Promise<number>;
                getMeetingsByThread: (threadId: number) => Promise<Meeting[]>;
                saveWorkStory: (type: 'story' | 'comment', overview: string, output: string, parentId?: number, title?: string, sourceMeetingId?: number) => Promise<number>;
                getWorkStories: () => Promise<WorkStory[]>;
                getComments: (storyId: number) => Promise<WorkStory[]>;
                updateWorkStoryTitle: (id: number, title: string) => Promise<void>;
                deleteThread: (threadId: number) => Promise<void>;
                deleteItem: (table: 'meetings' | 'work_stories', id: number) => Promise<void>;
                getTeamDevices: () => Promise<TeamDevice[]>;
                saveTeamDevice: (deviceName: string, pairingCode: string) => Promise<TeamDevice>;
                updateTeamDeviceTrustMode: (deviceId: string, trustMode: TeamTrustMode) => Promise<void>;
                deleteTeamDevice: (deviceId: string) => Promise<void>;
            };
            team: {
                getLocalProfile: () => Promise<LocalTeamProfile>;
                setLocalDeviceName: (name: string) => Promise<LocalTeamProfile>;
                getPeers: () => Promise<LanPeer[]>;
                scanPeers: () => Promise<LanPeer[]>;
                sendShare: (peerDeviceId: string, packet: TeamSharePacket) => Promise<void>;
                onEvent: (callback: (event: TeamShareEvent) => void) => () => void;
            };
            platform: string;
        };
    }
}

export { };
