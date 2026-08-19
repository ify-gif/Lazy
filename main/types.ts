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
    device_id?: string | null;
    occurred_at?: string | null;
    template?: string | null;
    pushed_at?: string | null;
    external_ref?: string | null;
    opm_workspace_id?: string | null;
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
    id?: number;
    meeting_id?: number;
    target?: string;
    text: string;
    body?: string | null;
    assignee?: string | null;
    due_date?: string | null;
    raid_type?: string | null;
    confidence?: number;
    pushed_at?: string | null;
    external_ref?: string | null;
    created_at?: string;
}

export interface ActionItemRecord {
    id: number;
    meeting_id: number;
    target: string;
    text: string;
    body: string | null;
    assignee: string | null;
    due_date: string | null;
    raid_type: string | null;
    confidence: number;
    pushed_at: string | null;
    external_ref: string | null;
    created_at: string;
}

export interface OutboundQueueItem {
    id: number;
    idempotency_key: string;
    endpoint: string;
    payload: string;
    attempts: number;
    next_attempt_at: string | null;
    last_error: string | null;
    created_at: string;
}

export interface BridgeSchemaCache {
    id: number;
    payload: string;
    fetched_at: string;
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

export interface TemplateDefinition {
    id: MeetingTemplate;
    label: string;
    sections: string[];
    targets: string[];
    prompt: (transcript: string, previousSummary?: string) => string;
}

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
    broadcastTargets?: string[];
    tcpListening: boolean;
    tcpPort: number;
    localAddresses?: string[];
    lastBroadcastAt?: number;
    peerCount: number;
    profileReady: boolean;
}

// O.PM Bridge Interfaces
export interface OPMPairingState {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
    expires_at: number;
}

export interface OPMProject {
    id: string;
    name: string;
}

export interface OPMWorkspace {
    id: string;
    name: string;
}

export interface OPMSchema {
    protocol: 1;
    targets: string[];
    projects: OPMProject[];
    workspace: OPMWorkspace;
    isStale?: boolean;
    fetched_at?: string;
}

export interface OPMExtractionItem {
    target: string;
    title: string;
    body: string | null;
    owner: string | null;
    due_date: string | null;
    raid_type: 'RISK' | 'ASSUMPTION' | 'ISSUE' | 'DEPENDENCY' | null;
    confidence: number;
}

export interface OPMMeetingSection {
    heading: string;
    body: string;
}

export interface OPMMeetingPushPayload {
    kind: 'meeting';
    protocol: 1;
    source: {
        device_id: string;
        device_name: string;
        lazy_version: string;
        meeting_id: number;
    };
    template: string;
    title: string;
    occurred_at: string;
    project_id: string | null;
    transcript: string;
    summary_md: string;
    sections: OPMMeetingSection[];
    extractions: OPMExtractionItem[];
}

export interface OPMBridgeStatus {
    connected: boolean;
    pairing: boolean;
    pairingState?: OPMPairingState | null;
    baseUrl: string;
    accountEmail?: string;
    workspaceName?: string;
    workspaceId?: string;
    deviceId?: string;
    deviceName?: string;
    lastPushAt?: string | null;
    pendingQueueCount: number;
    error?: string | null;
}

