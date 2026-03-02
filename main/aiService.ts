import { Store } from './store';
import { AIResponse, ActionItem, MeetingTemplate } from './types';
import { aiLogger } from './logger';

const OPENAI_API_URL = 'https://api.openai.com/v1';

interface ChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}

const PROMPTS = {
    whisper: "Technical Business Analyst meeting. Software requirements, Jira stories, API, GUI, Frontend, Backend, SQL, Acceptance Criteria.",

    summarizeMeeting: (transcript: string, template: MeetingTemplate = 'standard', previousSummary?: string) => {
        const baseDirective = `SYSTEM DIRECTIVE: DIRECT EXECUTIVE MEETING SUMMARIZER
You are a highly efficient, invisible technical assistant. Convert the transcript below into a clean, structured meeting summary.

${previousSummary ? `CONTEXT FROM PREVIOUS MEETING IN THIS THREAD:
${previousSummary}
---` : ''}

REQUIRED FORMAT (MARKDOWN RICH TEXT):`;

        const templateRules = {
            standard: `## Summary
- A single, short, punchy sentence that acts as the Title.

## Description
- Clean, context-rich breakdown using concise bullet points.
- Highlight technical decisions, key arguments, and specific outcomes.
- BOLD key technical terms or system names.

## Action Items
- Extract specific next steps, assigned owners, and any mentioned deadlines.
- If none, write: "- None".`,

            standup: `## Summary
- A single, short sentence summarizing the overall status.

## Yesterday
- Concise bullet points of what was accomplished.

## Today
- Concise bullet points of what is planned.

## Blockers
- Any impediments or issues preventing progress.
- If none, write: "- None".`,

            action_items: `## Summary
- A single, short sentence summarizing the meeting's focus.

## Action Items
- Extract every specific task, next step, assigned owner, and deadline.
- Present them as a prioritized bulleted list.
- If none, write: "- None".`,

            decision_log: `## Summary
- A single, short sentence stating the primary decision made.

## What Was Decided
- A clear, bulleted list of the final decisions reached.

## Why It Was Decided
- The rationale or technical reasoning behind the decisions.

## Alternatives Considered
- What other options were discussed and why they were rejected.
- If none, write: "- None".

## Action Items / Next Steps
- What needs to be done next to execute or follow up on this decision.
- Extract any specific tasks, assigned owners, and deadlines.
- If none, write: "- None".`
        };

        return `${baseDirective}\n${templateRules[template] || templateRules.standard}\n\nRaw Transcript:\n${transcript}`;
    },

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
${comment}`,

    extractActionItems: (summary: string) => `SYSTEM DIRECTIVE: ACTION ITEM EXTRACTOR
Extract every action item, task, next step, or follow-up from the meeting summary below.

RULES:
- Return a JSON object with a single key "items" containing an array
- Each item has: "text" (the task description, concise but complete) and optionally "assignee" (person or team name if mentioned)
- If no action items exist, return { "items": [] }
- Do NOT invent items. Only extract what is explicitly stated.
- Do NOT include meta-commentary or explanations.

Meeting Summary:
${summary}`,

    storyFromActionItem: (actionItem: string, meetingContext: string) => `SYSTEM DIRECTIVE: DIRECT EXECUTIVE WORK STORY
You are a highly efficient, invisible technical assistant. Convert the action item below into a clean, structured work record. Use the meeting context to enrich the story with relevant backstory, technical details, and acceptance criteria.

ABSOLUTE RULES:
NO META-COMMENTARY. NO EMOJIS. NO AGILE TEMPLATES.
Use the meeting context for background — do NOT repeat the entire meeting summary.

REQUIRED FORMAT (MARKDOWN RICH TEXT):
## Summary
- A single, short, punchy sentence that acts as the Title.

## Description
- Clean, context-rich breakdown using concise bullet points.
- Include relevant backstory from the meeting context.

## Acceptance Criteria
- Scout for conditions of success. Format as clear bullet points.

## Action Items
- Extract specific next steps or blockers.
- If none beyond the main task, write exactly: "- None".

Meeting Context:
${meetingContext}

Action Item:
${actionItem}`
};

export const AIService = {
    async transcribe(audioBuffer: Buffer): Promise<string> {
        const apiKey = Store.getApiKey();
        if (!apiKey) throw new Error("OpenAI API Key not found");

        const formData = new FormData();
        // Fixed: Buffer isn't directly assignable to BlobPart in some TS versions
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' });
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

    async summarizeMeeting(transcript: string, template: MeetingTemplate = 'standard', previousSummary?: string): Promise<string> {
        if (!this.isValidTranscript(transcript)) return "Transcript too short to summarize.";
        return this._callGPT(PROMPTS.summarizeMeeting(transcript, template, previousSummary));
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

    async extractActionItems(summary: string): Promise<ActionItem[]> {
        if (!summary || summary.length < 15) return [];
        const raw = await this._callGPT(PROMPTS.extractActionItems(summary), true);
        try {
            const parsed = JSON.parse(raw) as { items?: ActionItem[] };
            return Array.isArray(parsed.items) ? parsed.items : [];
        } catch {
            aiLogger.error('Failed to parse action items JSON');
            return [];
        }
    },

    async generateStoryFromActionItem(actionItem: string, meetingContext: string): Promise<AIResponse> {
        if (!actionItem || actionItem.length < 5) {
            return {
                summary: "Input too short",
                description: "Action item text is too short to generate a story."
            };
        }
        const response = await this._callGPT(PROMPTS.storyFromActionItem(actionItem, meetingContext));
        const summary = this._extractSummaryFromMarkdown(response) || (actionItem.split(' ').slice(0, 10).join(' ') + "...");
        return { summary, description: response };
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
