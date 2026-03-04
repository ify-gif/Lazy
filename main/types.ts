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

export type TeamTrustMode = 'trusted' | 'ask' | 'blocked';

export interface TeamDevice {
    id: number;
    device_id: string;
    device_name: string;
    pairing_code: string;
    fingerprint: string;
    trust_mode: TeamTrustMode;
    last_seen_at?: string | null;
    created_at?: string;
}

export interface LocalTeamProfile {
    deviceId: string;
    deviceName: string;
    pairingCode: string;
    fingerprint: string;
}

export interface LanPeer {
    deviceId: string;
    deviceName: string;
    pairingCode: string;
    fingerprint: string;
    address: string;
    port: number;
    lastSeenAt: number;
}

export interface TeamSharePacket {
    version: 1;
    kind: 'meeting' | 'story';
    shared_at: string;
    source_device?: string;
    pairing_code?: string;
    payload: Record<string, unknown>;
}

export interface TeamShareEvent {
    event: 'peers-updated' | 'share-imported' | 'share-rejected' | 'share-error';
    data?: unknown;
}

export interface TeamDiagnostics {
    discoveryBound: boolean;
    discoveryPort: number;
    discoveryError?: string;
    tcpListening: boolean;
    tcpPort: number;
    lastBroadcastAt?: number;
    peerCount: number;
    profileReady: boolean;
}
