import { Store } from './store';
import { AIResponse } from './types';
import { aiLogger } from './logger';

const OPENAI_API_URL = 'https://api.openai.com/v1';
interface ChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}

// Internal prompting system
const PROMPTS = {
    whisper: "Technical Business Analyst meeting. Software requirements, Jira stories, API, GUI, Frontend, Backend, SQL, Acceptance Criteria.",
    meetingSummary: (transcript: string) => `SYSTEM DIRECTIVE: LAZY APP - DIRECT EXECUTIVE MEETING NOTES
You are the intelligence layer of the LAZY app. You are a highly efficient, invisible Business Analyst taking notes directly inside a live meeting.

CRITICAL STRIKE RULES (DO NOT VIOLATE):
ZERO META-COMMENTARY: NEVER use the words "transcript," "recording," "speaker," "audio," or "text." Do NOT write "The transcript reveals..." or "In this meeting...". Act as if you are documenting facts natively.
NO CONSULTANT JARGON: NEVER use words like "Strategically," "Core opportunity," or "Multifunctional." Speak in plain, direct, sharp business English.
NO DENSE PARAGRAPHS: You must use the exact Markdown formatting below. Do not output massive walls of text.
RICH-TEXT MARKDOWN ONLY: Use markdown headers and bullet points exactly as specified.

REQUIRED OUTPUT FORMAT:
## TL;DR
- A brutal, 1-sentence bottom-line of the entire meeting.

## Summary
- A direct, 1-2 sentence overview of the meeting's purpose and main topic.

## Key Discussion Points
- Capture the core facts, features, technical details, and problems discussed.
- Use clean, context-rich bullet points.

## Action Items
- Extract specific tasks, next steps, or assignments.
- If none, write exactly: "- No specific action items assigned."

## Conclusion
- A brief 1-sentence wrap-up.

Transcript:
${transcript}`,
    workStory: (overview: string) => `SYSTEM DIRECTIVE: DIRECT EXECUTIVE WORK STORY
You are a highly efficient, invisible technical assistant. Convert raw audio dictation into a clean, structured work record.

ABSOLUTE RULES:
NO META-COMMENTARY. NO EMOJIS. NO AGILE TEMPLATES.

REQUIRED FORMAT (MARKDOWN RICH TEXT):
## Summary
- A single, short, punchy sentence that acts as the Title.

## Description
- Clean, context-rich breakdown using concise bullet points.

## Acceptance Criteria
- Scout for conditions of success. Format as clear bullet points.

## Action Items
- Extract specific next steps or blockers.
- If none, write exactly: "- None".

Raw Input:
${overview}`,
    polishComment: (comment: string) => `SYSTEM DIRECTIVE: DIRECT EXECUTIVE COMMENT POLISHER
Convert rough dictation into a clean, professional status update or ticket comment.

ABSOLUTE RULES:
Keep it concise and balanced. NO META-COMMENTARY. NO HEADERS OR EMOJIS.
BOLD key technical terms or system names.

Raw dictation:
${comment}`
};

export const AIService = {
    async transcribe(audioBuffer: Buffer): Promise<string> {
        const apiKey = Store.getApiKey();
        if (!apiKey) throw new Error("OpenAI API Key not found");

        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: 'audio/webm' });
        formData.append('file', blob, 'audio.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');
        formData.append('prompt', PROMPTS.whisper);

        aiLogger.info('Starting transcription request');
        const response = await this._fetchWithRetry(`${OPENAI_API_URL}/audio/transcriptions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        const data = await response.json() as { text: string };
        aiLogger.info(`Transcription complete. Text length: ${data.text.length}`);
        return data.text;
    },

    async validateKey(apiKey: string): Promise<boolean> {
        try {
            const response = await fetch(`${OPENAI_API_URL}/models`, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
            });
            return response.ok;
        } catch (error) {
            aiLogger.error("API Key Validation Error:", error);
            return false;
        }
    },

    isValidTranscript(text: string): boolean {
        if (!text || text.length < 15) return false;

        const hallucinations = [
            "Subtitle by Amara", "Thank you for watching", "Thanks for watching",
            "Like and subscribe", "Copyright", "All rights reserved"
        ];

        return !hallucinations.some(h => text.includes(h));
    },

    async summarizeMeeting(transcript: string): Promise<string> {
        if (!this.isValidTranscript(transcript)) {
            return "Insufficient or invalid content. Please record more audio.";
        }
        return this._callGPT(PROMPTS.meetingSummary(transcript));
    },

    async generateStory(overview: string): Promise<AIResponse> {
        if (!this.isValidTranscript(overview)) {
            return {
                summary: "Input too short",
                description: "Insufficient content to generate a strategic insight. Please record more detail."
            };
        }

        const response = await this._callGPT(PROMPTS.workStory(overview));
        const summary = this._extractSummaryFromMarkdown(response) || (overview.split(' ').slice(0, 10).join(' ') + "...");
        return { summary, description: response };
    },

    async polishComment(comment: string): Promise<string> {
        if (!this.isValidTranscript(comment)) return "Input too short to polish.";
        return this._callGPT(PROMPTS.polishComment(comment));
    },

    async _callGPT(prompt: string, jsonMode = false): Promise<string> {
        const apiKey = Store.getApiKey();
        if (!apiKey) throw new Error("OpenAI API Key not found");

        const body: {
            model: string;
            messages: { role: string; content: string }[];
            temperature: number;
            response_format?: { type: 'json_object' };
        } = {
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
        };

        if (jsonMode) {
            body.response_format = { type: 'json_object' };
        }

        aiLogger.info(`Calling GPT-4o. Prompt length: ${prompt.length}`);
        const response = await this._fetchWithRetry(`${OPENAI_API_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        const data = await response.json() as ChatCompletionResponse;
        aiLogger.info('GPT-4o response received');
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('Invalid completion response shape');
        }
        return content;
    },

    async _fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
        let lastError: Error | null = null;

        for (let i = 0; i < retries + 1; i++) {
            try {
                const response = await fetch(url, options);
                if (response.ok) return response;

                const responseBody = await response.text().catch(() => '');
                const compactBody = responseBody.replace(/\s+/g, ' ').trim();
                const bodySuffix = compactBody ? ` Body: ${compactBody.slice(0, 300)}` : '';
                lastError = new Error(`HTTP ${response.status} ${response.statusText}.${bodySuffix}`);

                const shouldRetry = response.status === 429 || response.status >= 500;
                if (!shouldRetry || i === retries) break;
            } catch (error: unknown) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (i === retries) break;
            }

            if (i < retries) {
                await new Promise(res => setTimeout(res, 1000 * (i + 1)));
            }
        }

        throw new Error(`Fetch failed after ${retries} retries: ${lastError?.message || 'Unknown error'}`);
    },

    _extractSummaryFromMarkdown(markdown: string): string | null {
        const summaryHeaderMatch = markdown.match(/##\s*Summary\s*[\r\n]+(?:-\s*)?(.+)/i);
        if (!summaryHeaderMatch?.[1]) return null;
        return summaryHeaderMatch[1].trim();
    },
};
