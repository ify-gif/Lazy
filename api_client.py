import requests
import json
import re
from typing import Dict
from time import time

# Import logging and rate limiting
from logger_config import logger
from rate_limiter import RateLimiter


class APIClient:
    def __init__(self, openai_api_key: str,
                 openai_model: str = 'gpt-4o', openai_max_tokens: int = 4000):
        self.openai_api_key = openai_api_key
        self.openai_model = openai_model
        self.openai_max_tokens = openai_max_tokens

        logger.info(f"APIClient initialized: model={openai_model}, max_tokens={openai_max_tokens}")

    @RateLimiter(calls_per_minute=10)
    def transcribe_audio(self, audio_file_path: str) -> str:
        """
        Transcribe audio file using OpenAI Whisper API.
        Rate limited to 10 calls per minute.
        """
        logger.info(f"Starting audio transcription: {audio_file_path}")
        start_time = time()

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

        try:
            with open(audio_file_path, 'rb') as f:
                files = {
                    'file': ('audio.wav', f, 'audio/wav'),
                    'model': (None, 'whisper-1'),
                    'language': (None, 'en'),
                    'prompt': (None, whisper_prompt)
                }
                response = requests.post(url, headers=headers, files=files, timeout=60)

            elapsed = time() - start_time
            logger.info(f"Transcription API call completed in {elapsed:.2f}s, status={response.status_code}")

            if not response.ok:
                logger.error(f"Transcription failed: status={response.status_code}, response={response.text[:200]}")
                raise Exception(f"Transcription failed: {response.text}")

            # Parse and validate response
            try:
                result = response.json()
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON response from Whisper API: {e}")
                raise Exception("API returned invalid JSON response")

            # Validate response structure
            if 'text' not in result:
                logger.error(f"Missing 'text' field in Whisper response: {result}")
                raise Exception("Invalid API response structure")

            text = result.get('text', '')
            logger.info(f"Transcription successful: {len(text)} characters transcribed")
            return text

        except requests.exceptions.Timeout:
            logger.error(f"Transcription timeout after 60s")
            raise Exception("Request timed out - audio file may be too large. Try a shorter recording.")
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Connection error during transcription: {e}")
            raise Exception("Network connection failed - check your internet connection")
        except FileNotFoundError:
            logger.error(f"Audio file not found: {audio_file_path}")
            raise Exception(f"Audio file not found: {audio_file_path}")
        except Exception as e:
            logger.exception("Unexpected error in transcribe_audio")
            raise

    @RateLimiter(calls_per_minute=10)
    def generate_meeting_summary(self, transcript: str) -> str:
        """
        Generate meeting summary from transcript using GPT-4o.
        Rate limited to 10 calls per minute.
        """
        logger.info(f"Starting meeting summary generation: transcript length={len(transcript)} chars")

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

    @RateLimiter(calls_per_minute=10)
    def generate_story_from_overview(self, overview: str) -> Dict[str, str]:
        """
        Generate Jira user story from overview using GPT-4o.
        Rate limited to 10 calls per minute.
        """
        logger.info(f"Starting story generation: overview length={len(overview)} chars")

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
            logger.info("Story generated successfully with valid JSON")
            return {
                'summary': data.get('summary', ''),
                'description': data.get('description', '')
            }
        except json.JSONDecodeError as e:
            logger.warning(f"JSON parsing failed, falling back to regex: {e}")
            # Fallback to regex parsing if JSON fails
            summary_match = re.search(r'SUMMARY\s*\n(.*?)(?=\n\nDESCRIPTION|\n*$)', response, re.DOTALL)
            description_match = re.search(r'DESCRIPTION\s*\n(.*?)$', response, re.DOTALL)
            return {
                'summary': summary_match.group(1).strip() if summary_match else '',
                'description': description_match.group(1).strip() if description_match else ''
            }

    @RateLimiter(calls_per_minute=10)
    def polish_comment(self, comment: str) -> str:
        """
        Polish raw comment into professional Jira comment using GPT-4o.
        Rate limited to 10 calls per minute.
        """
        logger.info(f"Starting comment polishing: comment length={len(comment)} chars")

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
        """
        Internal method to call OpenAI GPT API with comprehensive error handling.

        Args:
            prompt: The prompt to send to GPT
            json_mode: Whether to request JSON formatted response

        Returns:
            The content string from GPT response

        Raises:
            Exception: With user-friendly error messages for various failure modes
        """
        logger.info(f"GPT API call starting: model={self.openai_model}, json_mode={json_mode}, prompt_length={len(prompt)}")
        start_time = time()

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

        try:
            response = requests.post(url, headers=headers, json=data, timeout=30)
            elapsed = time() - start_time

            logger.info(f"GPT API response received in {elapsed:.2f}s, status={response.status_code}")

            if not response.ok:
                logger.error(f"GPT API error {response.status_code}: {response.text[:200]}")
                raise Exception(f"OpenAI API failed: {response.text}")

            # Parse JSON response
            try:
                result = response.json()
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON response from GPT API: {e}, response={response.text[:200]}")
                raise Exception("API returned invalid JSON response")

            # CRITICAL: Validate response structure (this fixes the crashes!)
            if 'choices' not in result:
                logger.error(f"Missing 'choices' in response: {result}")
                raise Exception("Invalid API response structure - missing 'choices'")

            if not isinstance(result['choices'], list) or len(result['choices']) == 0:
                logger.error(f"Empty or invalid choices array: {result.get('choices')}")
                raise Exception("API returned empty response")

            choice = result['choices'][0]
            if 'message' not in choice:
                logger.error(f"Missing 'message' in choice: {choice}")
                raise Exception("Invalid API response format - missing 'message'")

            if 'content' not in choice['message']:
                logger.error(f"Missing 'content' in message: {choice['message']}")
                raise Exception("API response missing content")

            content = choice['message']['content']
            logger.info(f"GPT API success: returned {len(content)} characters")
            logger.debug(f"Response preview: {content[:100]}...")

            return content

        except requests.exceptions.Timeout:
            logger.error(f"GPT API timeout after 30s")
            raise Exception("Request timed out - please try again")
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Connection error: {e}")
            raise Exception("Network connection failed - check your internet connection")
        except Exception as e:
            logger.exception("Unexpected error in _call_gpt")
            raise
