import os
from supabase import create_client, Client
from typing import List, Dict, Optional

class SupabaseClient:
    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)

    def save_transcript(self, data: Dict):
        """
        Saves a transcript to the 'transcripts' table.
        Expected keys: title, content, summary, duration, recording_date
        """
        result = self.client.table("transcripts").insert(data).execute()
        return result.data

    def get_transcripts(self, limit: int = 50) -> List[Dict]:
        result = self.client.table("transcripts")\
            .select("*")\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()
        return result.data

    def save_work_story(self, data: Dict):
        """
        Saves a work story to the 'work_stories' table.
        Expected keys: title, description, overview, comments, status
        """
        result = self.client.table("work_stories").insert(data).execute()
        return result.data

    def get_work_stories(self, limit: int = 50) -> List[Dict]:
        result = self.client.table("work_stories")\
            .select("*")\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()
        return result.data

    def delete_item(self, table: str, item_id: str):
        self.client.table(table).delete().eq("id", item_id).execute()
