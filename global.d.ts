import { AppStatus, StatusUpdate, UpdateEvent, Meeting, WorkStory, AIResponse } from './main/types';

declare global {
    interface Window {
        electron: {
            ipcRenderer: {
                send: (channel: string, data: any) => void;
                on: (channel: string, func: (...args: any[]) => void) => () => void;
                invoke: (channel: string, data: any) => Promise<any>;
            };
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
                check: () => Promise<any>;
                download: () => Promise<any>;
                install: () => void;
                onUpdateEvent: (callback: (data: UpdateEvent) => void) => () => void;
            };
            ai: {
                transcribe: (buffer: ArrayBuffer) => Promise<string>;
                summarizeMeeting: (transcript: string) => Promise<string>;
                generateStory: (overview: string) => Promise<AIResponse>;
                polishComment: (comment: string) => Promise<string>;
            };
            db: {
                saveMeeting: (title: string, transcript: string, summary: string) => Promise<number>;
                getMeetings: () => Promise<Meeting[]>;
                saveWorkStory: (type: 'story' | 'comment', overview: string, output: string, parentId?: number) => Promise<number>;
                getWorkStories: () => Promise<WorkStory[]>;
                getComments: (storyId: number) => Promise<WorkStory[]>;
                deleteItem: (table: 'meetings' | 'work_stories', id: number) => Promise<void>;
            };
            platform: string;
        };
    }
}

export { };
