import requests
import json
import re
from typing import Dict, Optional

class APIClient:
    def __init__(self, openai_api_key: str, 
                 openai_model: str = 'gpt-4o', openai_max_tokens: int = 4000):
        self.openai_api_key = openai_api_key
        self.openai_model = openai_model
        self.openai_max_tokens = openai_max_tokens

    def transcribe_audio(self, audio_file_path: str) -> str:
        url = 'https://api.openai.com/v1/audio/transcriptions'
        
        headers = {
            'Authorization': f'Bearer {self.openai_api_key}'
        }

        with open(audio_file_path, 'rb') as f:
            files = {
                'file': ('audio.wav', f, 'audio/wav'),
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
        return self._call_gpt(prompt)

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
        
        response = self._call_gpt(prompt)
        
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
        return self._call_gpt(prompt)

    def _call_gpt(self, prompt: str) -> str:
        url = 'https://api.openai.com/v1/chat/completions'
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.openai_api_key}'
        }
        data = {
            'model': self.openai_model,
            'max_tokens': self.openai_max_tokens,
            'messages': [
                {'role': 'user', 'content': prompt}
            ],
            'temperature': 0.7
        }
        
        response = requests.post(url, headers=headers, json=data)
        
        if not response.ok:
            raise Exception(f"OpenAI API failed: {response.text}")
            
        return response.json()['choices'][0]['message']['content']
