export interface Meeting {
    id?: number;
    title: string;
    transcript: string;
    summary: string;
    created_at?: string;
}

export interface WorkStory {
    id?: number;
    type: 'story' | 'comment';
    overview: string;
    output: string;
    created_at?: string;
    parent_id?: number | null;
}

export interface AIResponse {
    summary: string;
    description: string;
}

export type AppStatus = 'ready' | 'recording' | 'processing' | 'error';

export interface StatusUpdate {
    status: AppStatus;
    message?: string;
}

export interface UpdateEvent {
    event: string;
    data?: any;
}
