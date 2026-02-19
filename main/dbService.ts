import sqlite3 from 'sqlite3';
import { app } from 'electron';
import path from 'path';
import { Meeting, WorkStory } from './types';

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
    async saveMeeting(title: string, transcript: string, summary: string): Promise<number> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO meetings (title, transcript, summary) VALUES (?, ?, ?)',
                [title, transcript, summary],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },

    async getMeetings(limit = 50): Promise<Meeting[]> {
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

    // Work Stories
    async saveWorkStory(type: 'story' | 'comment', overview: string, output: string, parentId?: number, title?: string): Promise<number> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO work_stories (type, title, overview, output, parent_id) VALUES (?, ?, ?, ?, ?)',
                [type, type === 'story' ? (title ?? null) : null, overview, output, parentId || null],
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
    }
};
