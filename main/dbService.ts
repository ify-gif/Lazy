import sqlite3 from 'sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(app.getPath('userData'), 'lazy_history.db');

export const DBService = {
    db: null as sqlite3.Database | null,

    init() {
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

    createTables() {
        this.db?.serialize(() => {
            // Meetings Table
            this.db?.run(`
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
            this.db?.run(`
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
            this.db?.run(`ALTER TABLE work_stories ADD COLUMN parent_id INTEGER`, (err) => {
                // Ignore error if column already exists
            });
        });
    },

    // Meetings
    async saveMeeting(title: string, transcript: string, summary: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.db?.run(
                'INSERT INTO meetings (title, transcript, summary) VALUES (?, ?, ?)',
                [title, transcript, summary],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },

    async getMeetings(limit = 50): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db?.all(
                'SELECT * FROM meetings ORDER BY created_at DESC LIMIT ?',
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    },

    // Work Stories
    async saveWorkStory(type: 'story' | 'comment', overview: string, output: string, parentId?: number): Promise<number> {
        return new Promise((resolve, reject) => {
            this.db?.run(
                'INSERT INTO work_stories (type, overview, output, parent_id) VALUES (?, ?, ?, ?)',
                [type, overview, output, parentId || null],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },

    async getWorkStories(limit = 50): Promise<any[]> {
        return new Promise((resolve, reject) => {
            // Only fetch top-level stories (where parent_id is NULL or type is 'story')
            // Actually, we just want 'story' types here.
            this.db?.all(
                "SELECT * FROM work_stories WHERE type = 'story' ORDER BY created_at DESC LIMIT ?",
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    },

    async getCommentsHelper(storyId: number): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db?.all(
                "SELECT * FROM work_stories WHERE type = 'comment' AND parent_id = ? ORDER BY created_at ASC",
                [storyId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    },

    async deleteItem(table: 'meetings' | 'work_stories', id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db?.run(`DELETE FROM ${table} WHERE id = ?`, [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};
