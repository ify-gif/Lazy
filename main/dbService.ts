import sqlite3 from 'sqlite3';
import { app } from 'electron';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { Meeting, WorkStory, Thread, TeamDevice, TeamTrustMode, ActionItemRecord, OutboundQueueItem, BridgeSchemaCache, ActionItem } from './types';
import { Store } from './store';

const dbPath = path.join(app.getPath('userData'), 'lazy_history.db');

export const DBService = {
    db: null as sqlite3.Database | null,
    initPromise: null as Promise<void> | null,

    init(): Promise<void> {
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(dbPath, async (err) => {
                if (err) {
                    console.error('Failed to connect to database', err);
                    reject(err);
                    return;
                }

                try {
                    console.log('Connected to SQLite database at', dbPath);
                    await this.runMigrations();
                    resolve();
                } catch (migrationError) {
                    console.error('Failed to run DB migrations', migrationError);
                    reject(migrationError);
                }
            });
        });

        return this.initPromise;
    },

    async runMigrations(): Promise<void> {
        await this.run(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id TEXT PRIMARY KEY,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const appliedRows = await this.all<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id ASC');
        const applied = new Set(appliedRows.map((row) => row.id));

        const migrations: Array<{ id: string; run: () => Promise<void> }> = [
            {
                id: '001_create_meetings',
                run: async () => {
                    await this.run(`
                        CREATE TABLE IF NOT EXISTS meetings (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            title TEXT NOT NULL,
                            transcript TEXT,
                            summary TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                },
            },
            {
                id: '002_create_work_stories',
                run: async () => {
                    await this.run(`
                        CREATE TABLE IF NOT EXISTS work_stories (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            type TEXT NOT NULL,
                            title TEXT,
                            overview TEXT,
                            output TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            parent_id INTEGER
                        )
                    `);
                },
            },
            {
                id: '003_add_work_stories_parent_id',
                run: async () => {
                    await this.addColumnIfMissing('work_stories', 'parent_id', 'INTEGER');
                },
            },
            {
                id: '004_add_work_stories_title',
                run: async () => {
                    await this.addColumnIfMissing('work_stories', 'title', 'TEXT');
                },
            },
            {
                id: '005_add_work_stories_source_meeting_id',
                run: async () => {
                    await this.addColumnIfMissing('work_stories', 'source_meeting_id', 'INTEGER');
                },
            },
            {
                id: '006_create_threads',
                run: async () => {
                    await this.run(`
                        CREATE TABLE IF NOT EXISTS threads (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                },
            },
            {
                id: '007_add_meeting_thread_id',
                run: async () => {
                    await this.addColumnIfMissing('meetings', 'thread_id', 'INTEGER');
                },
            },
            {
                id: '008_create_team_devices',
                run: async () => {
                    await this.run(`
                        CREATE TABLE IF NOT EXISTS team_devices (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            device_id TEXT NOT NULL UNIQUE,
                            device_name TEXT NOT NULL,
                            pairing_code TEXT NOT NULL,
                            fingerprint TEXT NOT NULL,
                            trust_mode TEXT NOT NULL DEFAULT 'ask',
                            last_seen_at DATETIME,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                },
            },
            {
                id: '009_create_action_items',
                run: async () => {
                    await this.run(`
                        CREATE TABLE IF NOT EXISTS action_items (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            meeting_id INTEGER NOT NULL,
                            target TEXT NOT NULL DEFAULT 'TASK',
                            text TEXT NOT NULL,
                            body TEXT,
                            assignee TEXT,
                            due_date TEXT,
                            raid_type TEXT,
                            confidence REAL NOT NULL DEFAULT 0.5,
                            pushed_at DATETIME,
                            external_ref TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                },
            },
            {
                id: '010_add_meeting_sync_state',
                run: async () => {
                    await this.addColumnIfMissing('meetings', 'device_id', 'TEXT');
                    await this.addColumnIfMissing('meetings', 'occurred_at', 'DATETIME');
                    await this.addColumnIfMissing('meetings', 'template', 'TEXT');
                    await this.addColumnIfMissing('meetings', 'pushed_at', 'DATETIME');
                    await this.addColumnIfMissing('meetings', 'external_ref', 'TEXT');
                    await this.addColumnIfMissing('meetings', 'opm_workspace_id', 'TEXT');
                    const localDeviceId = Store.get('localDeviceId');
                    if (localDeviceId) {
                        await this.run("UPDATE meetings SET device_id = ? WHERE device_id IS NULL OR device_id = ''", [localDeviceId]);
                    }
                },
            },
            {
                id: '011_create_outbound_queue',
                run: async () => {
                    await this.run(`
                        CREATE TABLE IF NOT EXISTS outbound_queue (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            idempotency_key TEXT NOT NULL UNIQUE,
                            endpoint TEXT NOT NULL,
                            payload TEXT NOT NULL,
                            attempts INTEGER NOT NULL DEFAULT 0,
                            next_attempt_at DATETIME,
                            last_error TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                },
            },
            {
                id: '012_create_bridge_schema_cache',
                run: async () => {
                    await this.run(`
                        CREATE TABLE IF NOT EXISTS bridge_schema_cache (
                            id INTEGER PRIMARY KEY CHECK (id = 1),
                            payload TEXT NOT NULL,
                            fetched_at DATETIME NOT NULL
                        )
                    `);
                },
            },
        ];

        for (const migration of migrations) {
            if (applied.has(migration.id)) continue;

            console.log(`Applying migration: ${migration.id}`);
            await this.run('BEGIN TRANSACTION');
            try {
                await migration.run();
                await this.run('INSERT INTO schema_migrations (id) VALUES (?)', [migration.id]);
                await this.run('COMMIT');
            } catch (err) {
                await this.run('ROLLBACK');
                throw err;
            }
        }
    },

    async addColumnIfMissing(tableName: string, columnName: string, definition: string): Promise<void> {
        const columns = await this.all<{ name: string }>(`PRAGMA table_info(${tableName})`);
        const hasColumn = columns.some((column) => column.name === columnName);
        if (hasColumn) return;

        await this.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    },

    run(sql: string, params: unknown[] = []): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            db.run(sql, params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve((rows || []) as T[]);
            });
        });
    },

    // Meetings
    async saveMeeting(title: string, transcript: string, summary: string, threadId?: number): Promise<number> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO meetings (title, transcript, summary, thread_id) VALUES (?, ?, ?, ?)',
                [title, transcript, summary, threadId || null],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },

    async getMeetings(limit = 100): Promise<Meeting[]> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM meetings ORDER BY created_at DESC LIMIT ?',
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows as Meeting[]);
                }
            );
        });
    },

    async updateMeetingThread(meetingId: number, threadId: number | null): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE meetings SET thread_id = ? WHERE id = ?',
                [threadId, meetingId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    // Threads
    async getThreads(): Promise<Thread[]> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM threads ORDER BY name ASC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows as Thread[]);
            });
        });
    },

    async saveThread(name: string): Promise<number> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO threads (name) VALUES (?)', [name], function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    },

    async getMeetingsByThread(threadId: number): Promise<Meeting[]> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM meetings WHERE thread_id = ? ORDER BY created_at ASC',
                [threadId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows as Meeting[]);
                }
            );
        });
    },

    // Work Stories
    async saveWorkStory(type: 'story' | 'comment', overview: string, output: string, parentId?: number, title?: string, sourceMeetingId?: number): Promise<number> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO work_stories (type, title, overview, output, parent_id, source_meeting_id) VALUES (?, ?, ?, ?, ?, ?)',
                [type, type === 'story' ? (title ?? null) : null, overview, output, parentId || null, sourceMeetingId || null],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },

    async getWorkStories(limit = 50): Promise<WorkStory[]> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            // Only fetch top-level stories (where parent_id is NULL or type is 'story')
            // Actually, we just want 'story' types here.
            db.all(
                "SELECT * FROM work_stories WHERE type = 'story' ORDER BY created_at DESC LIMIT ?",
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows as WorkStory[]);
                }
            );
        });
    },

    async getCommentsHelper(storyId: number): Promise<WorkStory[]> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.all(
                "SELECT * FROM work_stories WHERE type = 'comment' AND parent_id = ? ORDER BY created_at ASC",
                [storyId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows as WorkStory[]);
                }
            );
        });
    },

    async updateWorkStoryTitle(id: number, title: string): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(
                "UPDATE work_stories SET title = ? WHERE id = ? AND type = 'story'",
                [title, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    async deleteThread(threadId: number): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                // Un-group meetings first
                db.run('UPDATE meetings SET thread_id = NULL WHERE thread_id = ?', [threadId], (updateErr) => {
                    if (updateErr) {
                        db.run('ROLLBACK');
                        reject(updateErr);
                        return;
                    }

                    // Delete the thread
                    db.run('DELETE FROM threads WHERE id = ?', [threadId], (deleteErr) => {
                        if (deleteErr) {
                            db.run('ROLLBACK');
                            reject(deleteErr);
                            return;
                        }

                        db.run('COMMIT', (commitErr) => {
                            if (commitErr) reject(commitErr);
                            else resolve();
                        });
                    });
                });
            });
        });
    },

    async deleteItem(table: 'meetings' | 'work_stories', id: number): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        if (table !== 'meetings' && table !== 'work_stories') {
            throw new Error('Invalid table name');
        }
        return new Promise((resolve, reject) => {
            if (table === 'meetings') {
                db.run('DELETE FROM meetings WHERE id = ?', [id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
                return;
            }

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run('DELETE FROM work_stories WHERE parent_id = ?', [id], (childErr) => {
                    if (childErr) {
                        db.run('ROLLBACK');
                        reject(childErr);
                        return;
                    }

                    db.run('DELETE FROM work_stories WHERE id = ?', [id], (itemErr) => {
                        if (itemErr) {
                            db.run('ROLLBACK');
                            reject(itemErr);
                            return;
                        }

                        db.run('COMMIT', (commitErr) => {
                            if (commitErr) reject(commitErr);
                            else resolve();
                        });
                    });
                });
            });
        });
    },

    // Team Devices
    async getTeamDevices(): Promise<TeamDevice[]> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM team_devices ORDER BY created_at DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows as TeamDevice[]);
            });
        });
    },

    async saveTeamDevice(deviceName: string, pairingCode: string): Promise<TeamDevice> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        const cleanName = deviceName.trim();
        if (!cleanName) {
            throw new Error('Device name is required');
        }
        if (!/^\d{6}$/.test(pairingCode)) {
            throw new Error('Pairing code must be 6 digits');
        }

        const deviceId = randomUUID();
        const fingerprint = this.createFingerprint(deviceId);

        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO team_devices (device_id, device_name, pairing_code, fingerprint, trust_mode) VALUES (?, ?, ?, ?, ?)',
                [deviceId, cleanName, pairingCode, fingerprint, 'ask'],
                async (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    try {
                        const [created] = await this.all<TeamDevice>('SELECT * FROM team_devices WHERE device_id = ?', [deviceId]);
                        if (!created) {
                            reject(new Error('Failed to fetch saved team device'));
                            return;
                        }
                        resolve(created);
                    } catch (fetchErr) {
                        reject(fetchErr);
                    }
                }
            );
        });
    },

    async updateTeamDeviceTrustMode(deviceId: string, trustMode: TeamTrustMode): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        if (!['trusted', 'ask', 'blocked'].includes(trustMode)) {
            throw new Error('Invalid trust mode');
        }
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE team_devices SET trust_mode = ? WHERE device_id = ?',
                [trustMode, deviceId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    async deleteTeamDevice(deviceId: string): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM team_devices WHERE device_id = ?', [deviceId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    // Action Items
    async saveActionItems(meetingId: number, items: ActionItem[]): Promise<ActionItemRecord[]> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');

        await new Promise<void>((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run('DELETE FROM action_items WHERE meeting_id = ?', [meetingId], (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }
                    const stmt = db.prepare(
                        'INSERT INTO action_items (meeting_id, target, text, body, assignee, due_date, raid_type, confidence, pushed_at, external_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    );
                    for (const item of items) {
                        stmt.run([
                            meetingId,
                            item.target || 'TASK',
                            item.text,
                            item.body || null,
                            item.assignee || null,
                            item.due_date || null,
                            item.raid_type || null,
                            item.confidence !== undefined ? item.confidence : 0.5,
                            item.pushed_at || null,
                            item.external_ref || null,
                        ]);
                    }
                    stmt.finalize((stmtErr) => {
                        if (stmtErr) {
                            db.run('ROLLBACK');
                            reject(stmtErr);
                            return;
                        }
                        db.run('COMMIT', (commitErr) => {
                            if (commitErr) reject(commitErr);
                            else resolve();
                        });
                    });
                });
            });
        });

        return this.getActionItems(meetingId);
    },

    async getActionItems(meetingId: number): Promise<ActionItemRecord[]> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM action_items WHERE meeting_id = ? ORDER BY id ASC',
                [meetingId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows as ActionItemRecord[]);
                }
            );
        });
    },

    async updateActionItemPushState(id: number, pushedAt: string, externalRef: string): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE action_items SET pushed_at = ?, external_ref = ? WHERE id = ?',
                [pushedAt, externalRef, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    // Meeting Sync State
    async updateMeetingSyncState(
        meetingId: number,
        updates: {
            deviceId?: string;
            occurredAt?: string;
            template?: string;
            pushedAt?: string;
            externalRef?: string;
            opmWorkspaceId?: string;
        }
    ): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');

        const fields: string[] = [];
        const values: unknown[] = [];

        if (updates.deviceId !== undefined) {
            fields.push('device_id = ?');
            values.push(updates.deviceId);
        }
        if (updates.occurredAt !== undefined) {
            fields.push('occurred_at = ?');
            values.push(updates.occurredAt);
        }
        if (updates.template !== undefined) {
            fields.push('template = ?');
            values.push(updates.template);
        }
        if (updates.pushedAt !== undefined) {
            fields.push('pushed_at = ?');
            values.push(updates.pushedAt);
        }
        if (updates.externalRef !== undefined) {
            fields.push('external_ref = ?');
            values.push(updates.externalRef);
        }
        if (updates.opmWorkspaceId !== undefined) {
            fields.push('opm_workspace_id = ?');
            values.push(updates.opmWorkspaceId);
        }

        if (fields.length === 0) return;
        values.push(meetingId);

        const sql = `UPDATE meetings SET ${fields.join(', ')} WHERE id = ?`;

        return new Promise((resolve, reject) => {
            db.run(sql, values, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    // Outbound Queue
    async enqueueOutbound(idempotencyKey: string, endpoint: string, payload: string): Promise<number> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');

        const existing = await this.all<OutboundQueueItem>('SELECT * FROM outbound_queue WHERE idempotency_key = ?', [idempotencyKey]);
        if (existing.length > 0) {
            return existing[0].id;
        }

        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO outbound_queue (idempotency_key, endpoint, payload) VALUES (?, ?, ?)',
                [idempotencyKey, endpoint, payload],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },

    async getPendingOutboundQueue(): Promise<OutboundQueueItem[]> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.all(
                "SELECT * FROM outbound_queue WHERE next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now') ORDER BY created_at ASC",
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows as OutboundQueueItem[]);
                }
            );
        });
    },

    async getOutboundQueueCount(): Promise<number> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM outbound_queue', (err, row: { count: number }) => {
                if (err) reject(err);
                else resolve(row ? row.count : 0);
            });
        });
    },

    async updateOutboundAttempt(id: number, attempts: number, nextAttemptAt: string | null, lastError: string | null): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE outbound_queue SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?',
                [attempts, nextAttemptAt, lastError, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    async removeOutboundQueueItem(id: number): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM outbound_queue WHERE id = ?', [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    async removeOutboundQueueItemByIdempotencyKey(key: string): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM outbound_queue WHERE idempotency_key = ?', [key], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    // Bridge Schema Cache
    async saveBridgeSchemaCache(payload: string): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO bridge_schema_cache (id, payload, fetched_at) VALUES (1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, fetched_at = CURRENT_TIMESTAMP",
                [payload],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    async getBridgeSchemaCache(): Promise<BridgeSchemaCache | null> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.all("SELECT id, payload, fetched_at FROM bridge_schema_cache WHERE id = 1", (err, rows) => {
                if (err) reject(err);
                else resolve((rows && rows.length > 0) ? (rows[0] as BridgeSchemaCache) : null);
            });
        });
    },

    createFingerprint(seed: string): string {
        const hash = createHash('sha256').update(seed).digest('hex').toUpperCase();
        const short = hash.slice(0, 12);
        return `${short.slice(0, 4)}-${short.slice(4, 8)}-${short.slice(8, 12)}`;
    }
};

