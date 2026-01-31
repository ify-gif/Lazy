import requests
import json
import re
from typing import Dict, Optional

class APIClient:
    def __init__(self, claude_api_key: str, whisper_api_key: str, whisper_provider: str = 'groq', 
                 claude_model: str = 'claude-3-5-sonnet-20240620', claude_max_tokens: int = 4000):
        self.claude_api_key = claude_api_key
        self.whisper_api_key = whisper_api_key
        self.whisper_provider = whisper_provider
        self.claude_model = claude_model
        self.claude_max_tokens = claude_max_tokens

    def transcribe_audio(self, audio_file_path: str) -> str:
        if self.whisper_provider == 'openai':
            url = 'https://api.openai.com/v1/audio/transcriptions'
        else:
            url = 'https://api.groq.com/openai/v1/audio/transcriptions'

        headers = {
            'Authorization': f'Bearer {self.whisper_api_key}'
        }

        with open(audio_file_path, 'rb') as f:
            files = {
                'file': ('audio.webm', f, 'audio/webm'),
                'model': (None, 'whisper-1')
            }
            response = requests.post(url, headers=headers, files=files)

        if not response.ok:
            raise Exception(f"Transcription failed: {response.text}")

        return response.json().get('text', '')

    def generate_meeting_summary(self, transcript: str) -> str:
        prompt = f"""Analyze this meeting transcript and create a structured summary.

Extract:
1. Participants (names mentioned in the conversation)
2. Key Decisions (important conclusions or agreements)
3. Action Items (tasks assigned with owners if mentioned)

Format your response as:
Participants: [list]

Key Decisions:
- [decision 1]
- [decision 2]

Action Items:
- [ ] [action with owner if known]

Transcript:
{transcript}"""
        return self._call_claude(prompt)

    def generate_story_from_overview(self, overview: str) -> Dict[str, str]:
        prompt = f"""You are helping create a Jira story. Convert this dictated overview into:

1. SUMMARY: A concise title (50-100 characters, action-oriented, no period at end)
2. DESCRIPTION: A clear 2-4 sentence description with context and purpose

Overview:
{overview}

Format your response exactly as:
SUMMARY
[Generated summary text]

DESCRIPTION
[Generated description text]"""
        
        response = self._call_claude(prompt)
        
        summary_match = re.search(r'SUMMARY\s*\n(.*?)(?=\n\nDESCRIPTION|\n*$)', response, re.DOTALL)
        description_match = re.search(r'DESCRIPTION\s*\n(.*?)$', response, re.DOTALL)
        
        return {
            'summary': summary_match.group(1).strip() if summary_match else '',
            'description': description_match.group(1).strip() if description_match else ''
        }

    def polish_comment(self, comment: str) -> str:
        prompt = f"""You are helping add a comment to a Jira story. Polish this dictated comment into a professional, well-structured paragraph.

Requirements:
- Clear and concise
- Professional tone
- 2-4 sentences
- Expand abbreviations if needed
- Fix grammar/phrasing
- Maintain original meaning and technical details

Raw dictation:
{comment}

Return only the polished comment text, no prefix or formatting."""
        return self._call_claude(prompt)

    def _call_claude(self, prompt: str) -> str:
        url = 'https://api.anthropic.com/v1/messages'
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': self.claude_api_key,
            'anthropic-version': '2023-06-01'
        }
        data = {
            'model': self.claude_model,
            'max_tokens': self.claude_max_tokens,
            'messages': [
                {'role': 'user', 'content': prompt}
            ]
        }
        
        response = requests.post(url, headers=headers, json=data)
        
        if not response.ok:
            raise Exception(f"Claude API failed: {response.text}")
            
        return response.json()['content'][0]['text']
