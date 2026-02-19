import { AppStatus, StatusUpdate, UpdateEvent, Meeting, WorkStory, AIResponse } from './main/types';

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
                summarizeMeeting: (transcript: string) => Promise<string>;
                generateStory: (overview: string) => Promise<AIResponse>;
                polishComment: (comment: string) => Promise<string>;
            };
            db: {
                saveMeeting: (title: string, transcript: string, summary: string) => Promise<number>;
                getMeetings: () => Promise<Meeting[]>;
                saveWorkStory: (type: 'story' | 'comment', overview: string, output: string, parentId?: number, title?: string) => Promise<number>;
                getWorkStories: () => Promise<WorkStory[]>;
                getComments: (storyId: number) => Promise<WorkStory[]>;
                updateWorkStoryTitle: (id: number, title: string) => Promise<void>;
                deleteItem: (table: 'meetings' | 'work_stories', id: number) => Promise<void>;
            };
            platform: string;
        };
    }
}

export { };
