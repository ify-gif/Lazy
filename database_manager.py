import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict

class DatabaseManager:
    def __init__(self, db_name: str = "lazy_data.db"):
        self.db_path = os.path.join(os.path.expanduser("~"), db_name)
        self.init_db()

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Transcripts Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS transcripts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    content TEXT,
                    summary TEXT,
                    duration INTEGER,
                    recording_date TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Work Stories Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS work_stories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    overview TEXT,
                    comments TEXT, -- Stored as JSON string
                    status TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()

    def save_transcript(self, data: Dict) -> int:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO transcripts (title, content, summary, duration, recording_date)
                VALUES (?, ?, ?, ?, ?)
            ''', (data['title'], data['content'], data['summary'], 
                  data['duration'], data.get('recording_date', datetime.now().isoformat())))
            conn.commit()
            return cursor.lastrowid

    def get_transcripts(self, limit: int = 50) -> List[Dict]:
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM transcripts ORDER BY created_at DESC LIMIT ?', (limit,))
            return [dict(row) for row in cursor.fetchall()]

    def save_work_story(self, data: Dict) -> int:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Convert list of comments to JSON string
            comments_json = json.dumps(data.get('comments', []))
            cursor.execute('''
                INSERT INTO work_stories (title, description, overview, comments, status)
                VALUES (?, ?, ?, ?, ?)
            ''', (data['title'], data['description'], data['overview'], 
                  comments_json, data['status']))
            conn.commit()
            return cursor.lastrowid

    def get_work_stories(self, limit: int = 50) -> List[Dict]:
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM work_stories ORDER BY created_at DESC LIMIT ?', (limit,))
            stories = []
            for row in cursor.fetchall():
                story = dict(row)
                story['comments'] = json.loads(story['comments']) if story['comments'] else []
                stories.append(story)
            return stories

    def delete_item(self, table: str, item_id: int):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f'DELETE FROM {table} WHERE id = ?', (item_id,))
            conn.commit()
