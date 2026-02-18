import sqlite3 from 'sqlite3';
import { app } from 'electron';
import path from 'path';
import { Meeting, WorkStory } from './types';

const dbPath = path.join(app.getPath('userData'), 'lazy_history.db');

export const DBService = {
    db: null as sqlite3.Database | null,

    init(): void {
        if (this.db) return;

        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Failed to connect to database', err);
                return;
            }
            console.log('Connected to SQLite database at', dbPath);
            this.createTables();
        });
    },

    createTables(): void {
        const db = this.db;
        if (!db) {
            console.error('DB not initialized');
            return;
        }

        db.serialize(() => {
            // Meetings Table
            db.run(`
                CREATE TABLE IF NOT EXISTS meetings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    transcript TEXT,
                    summary TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Work Stories Table
            // Using ALTER TABLE for non-destructive migration in dev
            db.run(`
                CREATE TABLE IF NOT EXISTS work_stories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL, -- 'story' or 'comment'
                    overview TEXT,
                    output TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    parent_id INTEGER
                )
            `);

            // Attempt to add parent_id if it doesn't exist (for existing DBs)
            db.run(`ALTER TABLE work_stories ADD COLUMN parent_id INTEGER`, (err) => {
                // Ignore error if column already exists
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
    async saveWorkStory(type: 'story' | 'comment', overview: string, output: string, parentId?: number): Promise<number> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO work_stories (type, overview, output, parent_id) VALUES (?, ?, ?, ?)',
                [type, overview, output, parentId || null],
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

    async deleteItem(table: 'meetings' | 'work_stories', id: number): Promise<void> {
        const db = this.db;
        if (!db) throw new Error('Database not initialized');
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM ${table} WHERE id = ?`, [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};
