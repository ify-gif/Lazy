export interface Thread {
    id: number;
    name: string;
    created_at?: string;
}

export interface Meeting {
    id: number;
    title: string;
    transcript: string;
    summary: string;
    created_at?: string;
    thread_id?: number | null;
}

export interface WorkStory {
    id?: number;
    type: 'story' | 'comment';
    title?: string | null;
    overview: string;
    output: string;
    created_at?: string;
    parent_id?: number | null;
    source_meeting_id?: number | null;
}

export interface ActionItem {
    text: string;
    assignee?: string;
}

export interface AIResponse {
    summary: string;
    description: string;
}

export type AppStatus = 'ready' | 'recording' | 'processing' | 'warning' | 'error';

export interface StatusUpdate {
    status: AppStatus;
    message?: string;
}

export interface UpdateEvent {
    event: string;
    data?: unknown;
}

export type MeetingTemplate = 'standard' | 'standup' | 'action_items' | 'decision_log';
