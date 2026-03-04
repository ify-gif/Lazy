export type LazyShareKind = 'meeting' | 'story';

export interface LazyShareEnvelope {
    version: 1;
    kind: LazyShareKind;
    shared_at: string;
    source_device?: string;
    pairing_code?: string;
    payload: Record<string, unknown>;
}

export function generatePairingCode(): string {
    return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

export function downloadLazyShareFile(envelope: LazyShareEnvelope, fileStem: string): void {
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFileName(fileStem)}.lazyshare`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

export async function parseLazyShareFile(file: File): Promise<LazyShareEnvelope> {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as Partial<LazyShareEnvelope>;

    if (parsed.version !== 1) {
        throw new Error('Unsupported .lazyshare version');
    }
    if (parsed.kind !== 'meeting' && parsed.kind !== 'story') {
        throw new Error('Invalid .lazyshare type');
    }
    if (!parsed.payload || typeof parsed.payload !== 'object') {
        throw new Error('Missing .lazyshare payload');
    }

    return {
        version: 1,
        kind: parsed.kind,
        shared_at: typeof parsed.shared_at === 'string' ? parsed.shared_at : new Date().toISOString(),
        source_device: typeof parsed.source_device === 'string' ? parsed.source_device : undefined,
        pairing_code: typeof parsed.pairing_code === 'string' ? parsed.pairing_code : undefined,
        payload: parsed.payload as Record<string, unknown>,
    };
}

function sanitizeFileName(name: string): string {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return 'lazy-share';
    return normalized.replace(/[^a-z0-9-_]+/g, '_').slice(0, 80);
}
