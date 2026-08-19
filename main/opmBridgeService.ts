import { app, BrowserWindow } from 'electron';
import { Store } from './store';
import { DBService } from './dbService';
import { AIService, DEFAULT_SCHEMA_TARGETS, TEMPLATE_REGISTRY } from './aiService';
import {
    OPMBridgeStatus,
    OPMPairingState,
    OPMSchema,
    OPMMeetingPushPayload,
    OutboundQueueItem,
    OPMExtractionItem,
    MeetingTemplate
} from './types';
import { logger } from './logger';

export const MAX_ATTEMPTS = 12;

export const DEFAULT_OPM_BASE_URL = 'https://opmhub.app';

interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
}

interface TokenSuccessResponse {
    access_token: string;
    workspace_id: string;
    workspace_name: string;
    account_email: string;
}

interface TokenErrorResponse {
    error: string;
    error_description?: string;
}

export const OPMBridgeService = {
    pairingTimer: null as NodeJS.Timeout | null,
    pairingState: null as OPMPairingState | null,
    drainPromise: null as Promise<void> | null,
    drainTimer: null as NodeJS.Timeout | null,
    lastError: null as string | null,

    get isDrainingQueue(): boolean {
        return this.drainPromise !== null;
    },

    getBaseUrl(): string {
        const custom = Store.get('opmBaseUrl');
        return (custom && custom.trim()) ? custom.trim().replace(/\/+$/, '') : DEFAULT_OPM_BASE_URL;
    },

    setBaseUrl(url: string): string {
        const clean = url.trim().replace(/\/+$/, '');
        if (clean) {
            Store.set('opmBaseUrl', clean);
        }
        return this.getBaseUrl();
    },

    getAppVersion(): string {
        try {
            return app.getVersion();
        } catch {
            return '1.2.12';
        }
    },

    getDeviceId(): string {
        return Store.get('localDeviceId') || 'unknown-device';
    },

    getDeviceName(): string {
        return Store.get('localDeviceName') || 'Lazy Client';
    },

    getAuthHeaders(token?: string): Record<string, string> {
        const deviceToken = token || Store.getOPMToken();
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Lazy-Protocol': '1',
            'X-Lazy-Version': this.getAppVersion(),
            'X-Lazy-Device-Id': this.getDeviceId(),
        };
        if (deviceToken) {
            headers['Authorization'] = `Bearer ${deviceToken}`;
        }
        return headers;
    },

    async getStatus(): Promise<OPMBridgeStatus> {
        const token = Store.getOPMToken();
        const pendingQueueCount = await DBService.getOutboundQueueCount().catch(() => 0);
        const deadLetterCount = await DBService.getDeadLetterCount().catch(() => 0);
        const deadLetterItems = await DBService.getDeadLetteredOutboundQueue().catch(() => []);
        return {
            connected: !!token,
            pairing: !!this.pairingState,
            pairingState: this.pairingState,
            baseUrl: this.getBaseUrl(),
            accountEmail: Store.get('opmAccountEmail') || undefined,
            workspaceName: Store.get('opmWorkspaceName') || undefined,
            workspaceId: Store.get('opmWorkspaceId') || undefined,
            deviceId: this.getDeviceId(),
            deviceName: this.getDeviceName(),
            pendingQueueCount,
            deadLetterCount,
            deadLetterItems,
            error: this.lastError,
        };
    },

    async retryDeadLetter(id?: number): Promise<void> {
        await DBService.retryDeadLetteredOutboundQueue(id);
        void this.drainQueue();
        this.broadcastStatus();
    },

    broadcastStatus(): void {
        void this.getStatus().then((status) => {
            try {
                if (typeof BrowserWindow !== 'undefined' && BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
                    BrowserWindow.getAllWindows().forEach((win) => {
                        win.webContents.send('opm-status-update', status);
                    });
                }
            } catch {
                // Ignore in non-Electron test environment
            }
        });
    },

    // --- PAIRING (RFC 8628) ---
    async startPairing(): Promise<OPMPairingState> {
        this.cancelPairing();
        this.lastError = null;

        const baseUrl = this.getBaseUrl();
        const deviceId = this.getDeviceId();
        const deviceName = this.getDeviceName();

        const response = await fetch(`${baseUrl}/api/bridge/device/code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Lazy-Protocol': '1',
                'X-Lazy-Version': this.getAppVersion(),
                'X-Lazy-Device-Id': deviceId,
            },
            body: JSON.stringify({
                device_name: deviceName,
                device_id: deviceId,
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`Failed to initiate pairing: HTTP ${response.status} ${errText}`);
        }

        const data = (await response.json()) as DeviceCodeResponse;
        const intervalSec = Math.max(1, data.interval || 5);
        const expiresAt = Date.now() + (data.expires_in || 600) * 1000;

        this.pairingState = {
            device_code: data.device_code,
            user_code: data.user_code,
            verification_uri: data.verification_uri,
            interval: intervalSec,
            expires_in: data.expires_in,
            expires_at: expiresAt,
        };

        this.schedulePollToken(data.device_code, intervalSec);
        this.broadcastStatus();
        return this.pairingState;
    },

    schedulePollToken(deviceCode: string, intervalSec: number): void {
        if (this.pairingTimer) clearTimeout(this.pairingTimer);

        this.pairingTimer = setTimeout(() => {
            void this.pollToken(deviceCode, intervalSec);
        }, intervalSec * 1000);
    },

    async pollToken(deviceCode: string, currentIntervalSec: number): Promise<void> {
        if (!this.pairingState || this.pairingState.device_code !== deviceCode) {
            return;
        }

        if (Date.now() >= this.pairingState.expires_at) {
            this.expirePairing();
            return;
        }

        const baseUrl = this.getBaseUrl();
        try {
            const response = await fetch(`${baseUrl}/api/bridge/device/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Lazy-Protocol': '1',
                    'X-Lazy-Version': this.getAppVersion(),
                    'X-Lazy-Device-Id': this.getDeviceId(),
                },
                body: JSON.stringify({ device_code: deviceCode }),
            });

            if (response.ok) {
                const data = (await response.json()) as TokenSuccessResponse;
                Store.setOPMToken(data.access_token);
                Store.set('opmWorkspaceId', data.workspace_id || '');
                Store.set('opmWorkspaceName', data.workspace_name || '');
                Store.set('opmAccountEmail', data.account_email || '');

                this.cancelPairing();
                this.lastError = null;

                void this.registerCapabilities();
                void this.fetchSchema();
                void this.drainQueue();

                this.broadcastStatus();
                return;
            }

            const errData = (await response.json().catch(() => ({}))) as TokenErrorResponse;
            const errorCode = errData.error || '';

            if (errorCode === 'authorization_pending') {
                this.schedulePollToken(deviceCode, currentIntervalSec);
            } else if (errorCode === 'slow_down') {
                const newInterval = currentIntervalSec + 5;
                this.pairingState.interval = newInterval;
                this.schedulePollToken(deviceCode, newInterval);
            } else if (errorCode === 'expired_token') {
                this.expirePairing();
            } else if (errorCode === 'access_denied') {
                this.cancelPairing();
                this.lastError = 'Access denied by user.';
                this.broadcastStatus();
            } else {
                this.schedulePollToken(deviceCode, currentIntervalSec);
            }
        } catch (err: unknown) {
            logger.error('Error polling O.PM device token', err);
            this.schedulePollToken(deviceCode, currentIntervalSec);
        }
    },

    cancelPairing(): void {
        if (this.pairingTimer) clearTimeout(this.pairingTimer);
        this.pairingTimer = null;
        this.pairingState = null;
        this.lastError = null;
        this.broadcastStatus();
    },

    /**
     * The code ran out of time. Distinct from cancelPairing(), which is a person
     * pressing Cancel and is not an error -- this one has to leave a reason behind,
     * because the settings card has nothing else to tell the user with.
     */
    expirePairing(): void {
        if (this.pairingTimer) clearTimeout(this.pairingTimer);
        this.pairingTimer = null;
        this.pairingState = null;
        this.lastError = 'Pairing code expired. Please start pairing again.';
        this.broadcastStatus();
    },

    disconnect(): void {
        this.cancelPairing();
        Store.setOPMToken('');
        Store.set('opmWorkspaceId', '');
        Store.set('opmWorkspaceName', '');
        Store.set('opmAccountEmail', '');
        this.lastError = null;
        this.broadcastStatus();
    },

    // --- CAPABILITY REGISTRATION ---
    async registerCapabilities(): Promise<boolean> {
        const token = Store.getOPMToken();
        if (!token) return false;

        const templatesPayload = Object.values(TEMPLATE_REGISTRY).map((tmpl) => ({
            id: tmpl.id,
            label: tmpl.label,
            sections: tmpl.sections,
            targets: tmpl.targets,
        }));

        try {
            const baseUrl = this.getBaseUrl();
            const response = await fetch(`${baseUrl}/api/bridge/capabilities`, {
                method: 'POST',
                headers: this.getAuthHeaders(token),
                body: JSON.stringify({
                    lazy_version: this.getAppVersion(),
                    templates: templatesPayload,
                }),
            });

            if (response.status === 401 || response.status === 403) {
                this.handleAuthFailure();
                return false;
            }

            return response.ok;
        } catch (err) {
            logger.error('Failed to register capabilities with O.PM', err);
            return false;
        }
    },

    // --- SCHEMA FETCHING & CACHING ---
    async fetchSchema(): Promise<OPMSchema> {
        const token = Store.getOPMToken();
        const baseUrl = this.getBaseUrl();

        if (token) {
            try {
                const response = await fetch(`${baseUrl}/api/bridge/schema`, {
                    method: 'GET',
                    headers: this.getAuthHeaders(token),
                });

                if (response.status === 401 || response.status === 403) {
                    this.handleAuthFailure();
                } else if (response.ok) {
                    const data = (await response.json()) as OPMSchema;
                    const schemaPayload: OPMSchema = {
                        protocol: 1,
                        targets: Array.isArray(data.targets) ? data.targets : DEFAULT_SCHEMA_TARGETS,
                        projects: Array.isArray(data.projects) ? data.projects : [],
                        workspace: data.workspace || { id: '', name: '' },
                    };
                    await DBService.saveBridgeSchemaCache(JSON.stringify(schemaPayload));
                    return { ...schemaPayload, isStale: false, fetched_at: new Date().toISOString() };
                }
            } catch (err) {
                logger.error('Failed to fetch online schema from O.PM', err);
            }
        }

        // Load cached schema from SQLite
        const cached = await DBService.getBridgeSchemaCache().catch(() => null);
        if (cached && cached.payload) {
            try {
                const parsed = JSON.parse(cached.payload) as OPMSchema;
                return {
                    protocol: 1,
                    targets: Array.isArray(parsed.targets) ? parsed.targets : DEFAULT_SCHEMA_TARGETS,
                    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
                    workspace: parsed.workspace || { id: '', name: '' },
                    isStale: true,
                    fetched_at: cached.fetched_at,
                };
            } catch {
                // fallback below
            }
        }

        // Constant fallback if no cached schema exists
        return {
            protocol: 1,
            targets: DEFAULT_SCHEMA_TARGETS,
            projects: [],
            workspace: { id: '', name: '' },
            isStale: true,
        };
    },

    // --- MEETING PUSH ---
    async pushMeeting(meetingId: number, projectId?: string | null): Promise<{ queued: boolean; pushed: boolean }> {
        const meetings = await DBService.getMeetings();
        const meeting = meetings.find((m) => m.id === meetingId);
        if (!meeting) throw new Error('Meeting not found');

        const deviceId = this.getDeviceId();
        const deviceName = this.getDeviceName();
        const appVersion = this.getAppVersion();
        const template = (meeting.template || 'standard') as MeetingTemplate;

        // Fetch schema to constrain target extraction
        const schema = await this.fetchSchema();

        // Extract structured target candidates using generalized AIService.extractTargets
        const extractions = await AIService.extractTargets(meeting.transcript, template, schema.targets);

        // Parse summary markdown into structured sections
        const sections = AIService.parseSummarySections(meeting.summary);

        const occurredAt = meeting.occurred_at || meeting.created_at || new Date().toISOString();

        const pushPayload: OPMMeetingPushPayload = {
            kind: 'meeting',
            protocol: 1,
            source: {
                device_id: deviceId,
                device_name: deviceName,
                lazy_version: appVersion,
                meeting_id: meeting.id,
            },
            template,
            title: meeting.title,
            occurred_at: occurredAt,
            project_id: projectId !== undefined ? projectId : null,
            transcript: meeting.transcript || '',
            summary_md: meeting.summary || '',
            sections,
            extractions,
        };

        const idempotencyKey = `lazy:${deviceId}:${meeting.id}`;

        const syncUpdate: {
            deviceId: string;
            template: MeetingTemplate;
            opmWorkspaceId?: string;
            occurredAt?: string;
        } = {
            deviceId,
            template,
            opmWorkspaceId: Store.get('opmWorkspaceId') || undefined,
        };

        if (!meeting.occurred_at) {
            syncUpdate.occurredAt = occurredAt;
        }

        // Save sync fields to meeting row
        await DBService.updateMeetingSyncState(meeting.id, syncUpdate);

        // Save action items to action_items table
        if (extractions.length > 0) {
            await DBService.saveActionItems(
                meeting.id,
                extractions.map((ex) => ({
                    target: ex.target,
                    text: ex.title,
                    body: ex.body,
                    assignee: ex.owner,
                    due_date: ex.due_date,
                    raid_type: ex.raid_type,
                    confidence: ex.confidence,
                }))
            );
        }

        // Enqueue outbound request
        await DBService.enqueueOutbound(idempotencyKey, '/api/bridge/meetings', JSON.stringify(pushPayload));

        // Immediately attempt queue drain (double drain ensures in-flight drains resolve before our item is processed)
        await this.drainQueue();
        await this.drainQueue();
        this.broadcastStatus();

        // Check if meeting was successfully pushed
        const updatedMeetings = await DBService.getMeetings();
        const updatedMeeting = updatedMeetings.find((m) => m.id === meeting.id);
        const isPushed = !!(updatedMeeting && updatedMeeting.pushed_at);

        return { queued: !isPushed, pushed: isPushed };
    },

    // --- OUTBOUND QUEUE DRAIN LOOP ---
    async drainQueue(): Promise<void> {
        if (this.drainPromise) return this.drainPromise;
        const token = Store.getOPMToken();
        if (!token) return;

        this.drainPromise = this.runDrain().finally(() => {
            this.drainPromise = null;
        });
        return this.drainPromise;
    },

    async runDrain(): Promise<void> {
        try {
            const pendingItems = await DBService.getPendingOutboundQueue();
            for (const item of pendingItems) {
                const currentToken = Store.getOPMToken();
                if (!currentToken) break; // disconnected or auth failed

                await this.processQueueItem(item, currentToken);
            }
        } catch (err) {
            logger.error('Error during outbound queue drain', err);
        } finally {
            this.broadcastStatus();
        }
    },

    async processQueueItem(item: OutboundQueueItem, token: string): Promise<boolean> {
        const baseUrl = this.getBaseUrl();
        const url = `${baseUrl}${item.endpoint}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    ...this.getAuthHeaders(token),
                    'Idempotency-Key': item.idempotency_key,
                },
                body: item.payload,
            });

            // 401 / 403 Auth failure: clear token, stop retrying
            if (response.status === 401 || response.status === 403) {
                this.handleAuthFailure();
                await DBService.updateOutboundAttempt(item.id, item.attempts + 1, null, `HTTP ${response.status} Auth failure`);
                return false;
            }

            // 200 OR 409 (Conflict/already pushed): treat as success
            if (response.ok || response.status === 409) {
                let externalRef = item.idempotency_key;
                const respText = await response.text().catch(() => '');
                try {
                    const respJson = JSON.parse(respText) as { meeting_id?: string; external_ref?: string };
                    if (respJson.meeting_id) externalRef = respJson.meeting_id;
                    else if (respJson.external_ref) externalRef = respJson.external_ref;
                } catch {
                    // use idempotencyKey as fallback externalRef
                }

                const pushedAt = new Date().toISOString();

                // Extract meeting_id from idempotency key format `lazy:<device_id>:<meeting_id>`
                const parts = item.idempotency_key.split(':');
                if (parts.length >= 3) {
                    const meetingIdNum = Number(parts[2]);
                    if (!Number.isNaN(meetingIdNum)) {
                        await DBService.updateMeetingSyncState(meetingIdNum, {
                            pushedAt,
                            externalRef,
                        });
                    }
                }

                await DBService.removeOutboundQueueItem(item.id);
                return true;
            }

            // Other HTTP errors (4xx / 5xx): retry with exponential backoff
            const errText = await response.text().catch(() => '');
            const attempts = item.attempts + 1;
            const lastError = `HTTP ${response.status}: ${errText.slice(0, 200)}`;

            if (attempts >= MAX_ATTEMPTS) {
                await DBService.markOutboundDeadLetter(item.id, `Max attempts (${MAX_ATTEMPTS}) reached. ${lastError}`);
                return false;
            }

            const delaySec = Math.min(300, Math.pow(2, attempts)); // 2s, 4s, 8s, 16s, 32s... cap at 300s
            const nextAttemptAt = new Date(Date.now() + delaySec * 1000).toISOString();

            await DBService.updateOutboundAttempt(item.id, attempts, nextAttemptAt, lastError);
            return false;
        } catch (err: unknown) {
            const errMessage = err instanceof Error ? err.message : String(err);
            const attempts = item.attempts + 1;
            const lastError = errMessage.slice(0, 200);

            if (attempts >= MAX_ATTEMPTS) {
                await DBService.markOutboundDeadLetter(item.id, `Max attempts (${MAX_ATTEMPTS}) reached. ${lastError}`);
                return false;
            }

            const delaySec = Math.min(300, Math.pow(2, attempts));
            const nextAttemptAt = new Date(Date.now() + delaySec * 1000).toISOString();

            await DBService.updateOutboundAttempt(item.id, attempts, nextAttemptAt, lastError);
            return false;
        }
    },

    handleAuthFailure(): void {
        this.lastError = 'Session invalid or access denied (HTTP 401/403). Please reconnect O.PM.';
        this.disconnect();
    },

    start(): void {
        void this.drainQueue();
        void this.registerCapabilities();
        void this.fetchSchema();

        // Drain queue periodically every 60 seconds
        if (this.drainTimer) clearInterval(this.drainTimer);
        this.drainTimer = setInterval(() => {
            void this.drainQueue();
        }, 60_000);
    },

    stop(): void {
        if (this.drainTimer) clearInterval(this.drainTimer);
        if (this.pairingTimer) clearTimeout(this.pairingTimer);
        this.drainTimer = null;
        this.pairingTimer = null;
    }
};
