import requests
import json
import re
from typing import Dict

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

        # Whisper Technical Context Prompt to stop hallucinations
        whisper_prompt = (
            "This is a technical Business Analyst session for the LAZY app. "
            "The audio contains software requirements, Jira stories, and technical jargon "
            "like API, GUI, Frontend, Backend, SQL, and Acceptance Criteria. "
            "Please transcribe in professional English, ignoring stutters or filler words."
        )

        with open(audio_file_path, 'rb') as f:
            files = {
                'file': ('audio.wav', f, 'audio/wav'),
                'model': (None, 'whisper-1'),
                'language': (None, 'en'),
                'prompt': (None, whisper_prompt) # Added strategic technical context
            }
            response = requests.post(url, headers=headers, files=files)

        if not response.ok:
            raise Exception(f"Transcription failed: {response.text}")

        return response.json().get('text', '')

    def generate_meeting_summary(self, transcript: str) -> str:
        prompt = f"""Role: You are a Senior Business Analyst. Task: Convert this meeting transcript into a technical-executive brief.

1. Executive Summary: A 2-sentence overview of the business value and key outcomes. 
2. Technical Specifications:
   - Functional: Logic, user flows, and feature requirements discussed.
   - Non-Functional: Performance, security, or data constraints. 
3. Strategic Decisions: List all "Hard Decisions" made vs. items deferred. 
4. Action Registry: A table with Task, Owner, Priority, and Logic Gaps (flagging missing technical info). 
5. Key Insights & Sentiment: Highlight any "under-the-radar" observations. (e.g., "The team expressed hesitation about the Q3 budget," or "Customer X specifically praised the new UI.")
6. Participant List: Mention all active contributors.
7. Parked Items (The Sandbox): List topics that were brought up but tabled for future discussion.
8. Unresolved Logic Gaps: List technical questions or business rules that remain undefined and require follow-up.

Constraint: Do not use corporate jargon or filler. Be direct, objective, and keep the total length under 500 words.

Transcript:
{transcript}"""
        return self._call_gpt(prompt)

    def generate_story_from_overview(self, overview: str) -> Dict[str, str]:
        prompt = f"""Role: You are a Technical Project Manager. Task: Convert this dictated thought into a structured Jira User Story JSON object.

Fields required in the JSON:
- "summary": Action-oriented title (50-100 chars, no period at end).
- "description": A professional technical overview including:
  1. User Story: (As a... I want... So that...)
  2. Technical Context: System dependencies or data requirements.
  3. Acceptance Criteria: A bulleted list of "Given/When/Then" (Gherkin) validation points.

Overview:
{overview}

Return ONLY valid JSON, no markdown or other formatting."""

        response = self._call_gpt(prompt, json_mode=True)

        try:
            data = json.loads(response)
            return {
                'summary': data.get('summary', ''),
                'description': data.get('description', '')
            }
        except json.JSONDecodeError:
            # Fallback to regex parsing if JSON fails
            summary_match = re.search(r'SUMMARY\s*\n(.*?)(?=\n\nDESCRIPTION|\n*$)', response, re.DOTALL)
            description_match = re.search(r'DESCRIPTION\s*\n(.*?)$', response, re.DOTALL)
            return {
                'summary': summary_match.group(1).strip() if summary_match else '',
                'description': description_match.group(1).strip() if description_match else ''
            }

    def polish_comment(self, comment: str) -> str:
        prompt = f"""Role: Professional Editor / Senior BA. Task: Clean this recording into a precise Jira comment.

Requirements:
- Remove all fillers ("umms", "ahhs", "so yeah").
- Executive-Technical Balance: Maintain professional tone while preserving technical jargon and specific data points.
- Formatting: Use Markdown bolding for key terms (e.g., **API**, **Database**, **Deadline**).
- Length: 2-8 sentences.
- Clarity: Expand abbreviations if they are ambiguous, but keep standard tech shorthand.

Raw dictation:
{comment}

Return only the polished comment text, no prefix or formatting."""
        return self._call_gpt(prompt)

    def _call_gpt(self, prompt: str, json_mode: bool = False) -> str:
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
            'temperature': 0.3
        }

        if json_mode:
            data['response_format'] = {'type': 'json_object'}

        response = requests.post(url, headers=headers, json=data)

        if not response.ok:
            raise Exception(f"OpenAI API failed: {response.text}")

        return response.json()['choices'][0]['message']['content']
