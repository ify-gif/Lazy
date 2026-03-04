import dgram from 'dgram';
import net from 'net';
import os from 'os';
import { createHash, randomUUID } from 'crypto';
import { BrowserWindow } from 'electron';
import { Store } from './store';
import { DBService } from './dbService';
import { LanPeer, LocalTeamProfile, TeamDiagnostics, TeamShareEvent, TeamSharePacket } from './types';

const DISCOVERY_PORT = 41234;
const TEAM_TCP_PORT = 41235;
const BROADCAST_HOST = '255.255.255.255';
const PEER_TTL_MS = 15_000;
const DISCOVERY_INTERVAL_MS = 3_000;

interface PeerAnnouncement {
    type: 'lazy-peer';
    version: 1;
    deviceId: string;
    deviceName: string;
    pairingCode: string;
    fingerprint: string;
    port: number;
}

interface ShareEnvelope {
    type: 'lazy-share';
    version: 1;
    sender: {
        deviceId: string;
        deviceName: string;
        pairingCode: string;
        fingerprint: string;
    };
    packet: TeamSharePacket;
}

interface ProbeRequest {
    type: 'lazy-probe';
    version: 1;
}

interface ProbeResponse {
    type: 'lazy-probe-ack';
    version: 1;
    deviceId: string;
    deviceName: string;
    pairingCode: string;
    fingerprint: string;
    port: number;
}

type MutablePeer = LanPeer & { remoteAddress: string };

export const TeamShareService = {
    discoverySocket: null as dgram.Socket | null,
    tcpServer: null as net.Server | null,
    broadcastTimer: null as NodeJS.Timeout | null,
    cleanupTimer: null as NodeJS.Timeout | null,
    peers: new Map<string, MutablePeer>(),
    profile: null as LocalTeamProfile | null,
    listeningPort: 0,
    started: false,
    discoveryBound: false,
    lastBroadcastAt: 0,
    discoveryError: '',
    lastBroadcastTargets: [] as string[],

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        await DBService.init();
        this.profile = this.getOrCreateLocalProfile();
        await this.startTcpServer();
        this.startDiscoverySocket();
        this.broadcastPresence();
        this.broadcastTimer = setInterval(() => this.broadcastPresence(), DISCOVERY_INTERVAL_MS);
        this.cleanupTimer = setInterval(() => this.prunePeers(), 2_000);
    },

    stop(): void {
        if (this.broadcastTimer) clearInterval(this.broadcastTimer);
        if (this.cleanupTimer) clearInterval(this.cleanupTimer);
        this.broadcastTimer = null;
        this.cleanupTimer = null;
        this.discoverySocket?.close();
        this.tcpServer?.close();
        this.discoverySocket = null;
        this.tcpServer = null;
        this.discoveryBound = false;
        this.lastBroadcastAt = 0;
        this.discoveryError = '';
        this.lastBroadcastTargets = [];
        this.peers.clear();
        this.started = false;
    },

    getLocalProfile(): LocalTeamProfile {
        if (!this.profile) {
            this.profile = this.getOrCreateLocalProfile();
        }
        return this.profile;
    },

    getPeers(): LanPeer[] {
        return Array.from(this.peers.values())
            .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
            .map((peer) => ({
                deviceId: peer.deviceId,
                deviceName: peer.deviceName,
                pairingCode: peer.pairingCode,
                fingerprint: peer.fingerprint,
                address: peer.address,
                port: peer.port,
                lastSeenAt: peer.lastSeenAt,
            }));
    },

    async sendShare(peerDeviceId: string, packet: TeamSharePacket): Promise<void> {
        const peer = this.peers.get(peerDeviceId);
        if (!peer) {
            throw new Error('Peer not available on LAN');
        }
        const profile = this.getLocalProfile();
        const envelope: ShareEnvelope = {
            type: 'lazy-share',
            version: 1,
            sender: {
                deviceId: profile.deviceId,
                deviceName: profile.deviceName,
                pairingCode: profile.pairingCode,
                fingerprint: profile.fingerprint,
            },
            packet,
        };

        await new Promise<void>((resolve, reject) => {
            const socket = net.createConnection({ host: peer.remoteAddress, port: peer.port }, () => {
                socket.write(`${JSON.stringify(envelope)}\n`);
                socket.end();
            });
            socket.on('error', reject);
            socket.on('close', () => resolve());
        });
    },

    async probePeer(address: string): Promise<LanPeer> {
        const cleanAddress = address.trim();
        if (!cleanAddress) {
            throw new Error('IP address is required');
        }
        const profile = this.getLocalProfile();
        return await new Promise<LanPeer>((resolve, reject) => {
            let resolved = false;
            const socket = net.createConnection({ host: cleanAddress, port: TEAM_TCP_PORT }, () => {
                const probe: ProbeRequest = { type: 'lazy-probe', version: 1 };
                socket.write(`${JSON.stringify(probe)}\n`);
            });

            let buffer = '';
            socket.setTimeout(3_500);
            socket.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                if (!buffer.includes('\n')) return;
                const line = buffer.slice(0, buffer.indexOf('\n')).trim();
                if (!line) return;
                try {
                    const ack = JSON.parse(line) as ProbeResponse;
                    if (ack.type !== 'lazy-probe-ack' || ack.version !== 1) {
                        throw new Error('Invalid probe response from target');
                    }
                    if (ack.deviceId === profile.deviceId) {
                        throw new Error('That IP belongs to this same device');
                    }
                    const peer: MutablePeer = {
                        deviceId: ack.deviceId,
                        deviceName: ack.deviceName,
                        pairingCode: ack.pairingCode,
                        fingerprint: ack.fingerprint,
                        address: cleanAddress,
                        remoteAddress: cleanAddress,
                        port: ack.port || TEAM_TCP_PORT,
                        lastSeenAt: Date.now(),
                    };
                    this.peers.set(peer.deviceId, peer);
                    this.emitEvent({ event: 'peers-updated', data: this.getPeers() });
                    resolved = true;
                    socket.end();
                    resolve({
                        deviceId: peer.deviceId,
                        deviceName: peer.deviceName,
                        pairingCode: peer.pairingCode,
                        fingerprint: peer.fingerprint,
                        address: peer.address,
                        port: peer.port,
                        lastSeenAt: peer.lastSeenAt,
                    });
                } catch (err) {
                    socket.destroy();
                    reject(err);
                }
            });
            socket.on('timeout', () => {
                socket.destroy();
                if (!resolved) reject(new Error('Connection timed out'));
            });
            socket.on('error', (err) => {
                if (!resolved) {
                    if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
                        reject(new Error('Target refused connection on LAN service'));
                        return;
                    }
                    reject(new Error(err.message || 'Network error during connect'));
                }
            });
            socket.on('close', () => {
                if (!resolved && buffer.length === 0) {
                    reject(new Error('Connected but no probe response (target app may be older)'));
                }
            });
        });
    },

    async scanPeers(): Promise<LanPeer[]> {
        if (!this.discoveryBound) {
            this.startDiscoverySocket();
            await this.delay(500);
        }
        this.broadcastPresence();
        await this.delay(900);
        this.broadcastPresence();
        await this.delay(900);
        this.prunePeers();
        return this.getPeers();
    },

    getDiagnostics(): TeamDiagnostics {
        return {
            discoveryBound: this.discoveryBound,
            discoveryPort: DISCOVERY_PORT,
            discoveryError: this.discoveryError || undefined,
            broadcastTargets: this.lastBroadcastTargets.length > 0 ? this.lastBroadcastTargets : undefined,
            tcpListening: this.listeningPort > 0,
            tcpPort: this.listeningPort,
            localAddresses: this.getLocalAddresses(),
            lastBroadcastAt: this.lastBroadcastAt || undefined,
            peerCount: this.peers.size,
            profileReady: !!this.profile,
        };
    },

    getOrCreateLocalProfile(): LocalTeamProfile {
        const savedDeviceId = Store.get('localDeviceId');
        const savedDeviceName = Store.get('localDeviceName');
        const savedPairingCode = Store.get('localPairingCode');
        const savedFingerprint = Store.get('localFingerprint');

        const deviceId = savedDeviceId || randomUUID();
        const deviceName = savedDeviceName || `${os.hostname()}-Lazy`;
        const pairingCode = /^\d{6}$/.test(savedPairingCode) ? savedPairingCode : this.generatePairingCode();
        const fingerprint = savedFingerprint || this.createFingerprint(deviceId);

        Store.set('localDeviceId', deviceId);
        Store.set('localDeviceName', deviceName);
        Store.set('localPairingCode', pairingCode);
        Store.set('localFingerprint', fingerprint);

        return { deviceId, deviceName, pairingCode, fingerprint };
    },

    setLocalDeviceName(name: string): LocalTeamProfile {
        const trimmed = name.trim();
        if (!trimmed) {
            return this.getLocalProfile();
        }
        Store.set('localDeviceName', trimmed);
        this.profile = this.getOrCreateLocalProfile();
        this.broadcastPresence();
        return this.profile;
    },

    generatePairingCode(): string {
        return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    },

    createFingerprint(seed: string): string {
        const hash = createHash('sha256').update(seed).digest('hex').toUpperCase();
        const short = hash.slice(0, 12);
        return `${short.slice(0, 4)}-${short.slice(4, 8)}-${short.slice(8, 12)}`;
    },

    async startTcpServer(): Promise<void> {
        this.tcpServer = net.createServer((socket) => {
            let buffer = '';
            socket.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                if (!buffer.includes('\n')) return;
                const raw = buffer.slice(0, buffer.indexOf('\n')).trim();
                buffer = '';
                void this.handleIncomingPayload(raw, socket).catch((err) => {
                    this.emitEvent({ event: 'share-error', data: { message: err instanceof Error ? err.message : 'Share import failed' } });
                });
            });
        });

        await new Promise<void>((resolve, reject) => {
            this.tcpServer?.once('error', (err) => reject(err));
            this.tcpServer?.listen(TEAM_TCP_PORT, '0.0.0.0', () => {
                const address = this.tcpServer?.address();
                if (!address || typeof address === 'string') {
                    reject(new Error('Failed to start team share server'));
                    return;
                }
                this.listeningPort = address.port;
                resolve();
            });
        });
    },

    async handleIncomingPayload(raw: string, socket: net.Socket): Promise<void> {
        const parsed = JSON.parse(raw) as Partial<ShareEnvelope | ProbeRequest>;
        if (parsed.type === 'lazy-probe') {
            const profile = this.getLocalProfile();
            const ack: ProbeResponse = {
                type: 'lazy-probe-ack',
                version: 1,
                deviceId: profile.deviceId,
                deviceName: profile.deviceName,
                pairingCode: profile.pairingCode,
                fingerprint: profile.fingerprint,
                port: this.listeningPort || TEAM_TCP_PORT,
            };
            socket.write(`${JSON.stringify(ack)}\n`);
            socket.end();
            return;
        }

        await this.handleIncomingShare(raw);
    },

    startDiscoverySocket(): void {
        if (this.discoverySocket) {
            try {
                this.discoverySocket.close();
            } catch {
                // noop
            }
        }
        this.discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        this.discoverySocket.on('error', (err) => {
            this.discoveryBound = false;
            this.discoveryError = err.message || 'UDP bind failed';
            this.emitEvent({ event: 'share-error', data: { message: this.discoveryError } });
        });
        this.discoverySocket.on('message', (msg, rinfo) => {
            this.handleDiscoveryMessage(msg, rinfo.address);
        });
        this.discoverySocket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
            this.discoverySocket?.setBroadcast(true);
            this.discoveryBound = true;
            this.discoveryError = '';
        });
    },

    broadcastPresence(): void {
        const profile = this.getLocalProfile();
        if (!this.discoverySocket || this.listeningPort === 0) return;

        const payload: PeerAnnouncement = {
            type: 'lazy-peer',
            version: 1,
            deviceId: profile.deviceId,
            deviceName: profile.deviceName,
            pairingCode: profile.pairingCode,
            fingerprint: profile.fingerprint,
            port: this.listeningPort,
        };
        const data = Buffer.from(JSON.stringify(payload), 'utf8');
        const targets = this.getBroadcastTargets();
        this.lastBroadcastTargets = targets;
        for (const host of targets) {
            this.discoverySocket.send(data, DISCOVERY_PORT, host);
        }
        this.lastBroadcastAt = Date.now();
    },

    getBroadcastTargets(): string[] {
        const targets = new Set<string>();
        targets.add(BROADCAST_HOST);

        const interfaces = os.networkInterfaces();
        for (const infos of Object.values(interfaces)) {
            if (!infos) continue;
            for (const info of infos) {
                if (info.family !== 'IPv4' || info.internal) continue;
                const broadcast = this.computeBroadcastAddress(info.address, info.netmask);
                if (broadcast) targets.add(broadcast);
            }
        }

        return Array.from(targets);
    },

    computeBroadcastAddress(ip: string, netmask: string): string | null {
        const ipOctets = ip.split('.').map((part) => Number(part));
        const maskOctets = netmask.split('.').map((part) => Number(part));
        if (ipOctets.length !== 4 || maskOctets.length !== 4) return null;
        if (ipOctets.some((n) => Number.isNaN(n)) || maskOctets.some((n) => Number.isNaN(n))) return null;

        const out: number[] = [];
        for (let i = 0; i < 4; i += 1) {
            out.push((ipOctets[i] & maskOctets[i]) | (~maskOctets[i] & 255));
        }
        return out.join('.');
    },

    getLocalAddresses(): string[] {
        const ips = new Set<string>();
        const interfaces = os.networkInterfaces();
        for (const infos of Object.values(interfaces)) {
            if (!infos) continue;
            for (const info of infos) {
                if (info.family === 'IPv4' && !info.internal) {
                    ips.add(info.address);
                }
            }
        }
        return Array.from(ips);
    },

    handleDiscoveryMessage(msg: Buffer, remoteAddress: string): void {
        let parsed: PeerAnnouncement | null = null;
        try {
            parsed = JSON.parse(msg.toString('utf8')) as PeerAnnouncement;
        } catch {
            return;
        }
        if (!parsed || parsed.type !== 'lazy-peer' || parsed.version !== 1) return;
        if (!this.profile) return;
        if (parsed.deviceId === this.profile.deviceId) return;

        this.peers.set(parsed.deviceId, {
            deviceId: parsed.deviceId,
            deviceName: parsed.deviceName,
            pairingCode: parsed.pairingCode,
            fingerprint: parsed.fingerprint,
            address: remoteAddress,
            remoteAddress,
            port: parsed.port,
            lastSeenAt: Date.now(),
        });
        this.emitEvent({ event: 'peers-updated', data: this.getPeers() });
    },

    prunePeers(): void {
        const now = Date.now();
        let changed = false;
        for (const [deviceId, peer] of this.peers.entries()) {
            if (now - peer.lastSeenAt > PEER_TTL_MS) {
                this.peers.delete(deviceId);
                changed = true;
            }
        }
        if (changed) {
            this.emitEvent({ event: 'peers-updated', data: this.getPeers() });
        }
    },

    async handleIncomingShare(raw: string): Promise<void> {
        const parsed = JSON.parse(raw) as Partial<ShareEnvelope>;
        if (!parsed || parsed.type !== 'lazy-share' || parsed.version !== 1 || !parsed.packet || !parsed.sender) {
            throw new Error('Invalid LAN share packet');
        }

        const senderPairingCode = parsed.sender.pairingCode;
        const senderName = parsed.sender.deviceName || 'Unknown Device';
        const senderFingerprint = parsed.sender.fingerprint || '';
        const packet = parsed.packet;

        const known = (await DBService.getTeamDevices()).find((d) => d.pairing_code === senderPairingCode);
        if (known && known.trust_mode === 'blocked') {
            this.emitEvent({
                event: 'share-rejected',
                data: { reason: 'blocked', sender: senderName, pairingCode: senderPairingCode },
            });
            return;
        }

        if (packet.kind === 'meeting') {
            const title = typeof packet.payload.title === 'string' ? packet.payload.title : 'Shared Meeting';
            const transcript = typeof packet.payload.transcript === 'string' ? packet.payload.transcript : '';
            const summary = typeof packet.payload.summary === 'string' ? packet.payload.summary : '';
            await DBService.saveMeeting(`[Shared] ${title}`, transcript, summary);
        } else if (packet.kind === 'story') {
            const title = typeof packet.payload.title === 'string' ? packet.payload.title : 'Shared Story';
            const overview = typeof packet.payload.overview === 'string' ? packet.payload.overview : '';
            const output = typeof packet.payload.output === 'string' ? packet.payload.output : '';
            await DBService.saveWorkStory('story', overview, output, undefined, `[Shared] ${title}`);
        } else {
            throw new Error('Unsupported share kind');
        }

        this.emitEvent({
            event: 'share-imported',
            data: {
                kind: packet.kind,
                sender: senderName,
                pairingCode: senderPairingCode,
                fingerprint: senderFingerprint,
            },
        });
    },

    emitEvent(event: TeamShareEvent): void {
        BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send('team-share-event', event);
        });
    },

    delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    },
};
