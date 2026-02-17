import { Store } from './store';

const OPENAI_API_URL = 'https://api.openai.com/v1';

export const AIService = {
    async transcribe(audioBuffer: Buffer): Promise<string> {
        const apiKey = Store.getApiKey();
        if (!apiKey) throw new Error("OpenAI API Key not found");

        const whisperPrompt = (
            "Technical Business Analyst meeting. Software requirements, Jira stories, API, GUI, Frontend, Backend, SQL, Acceptance Criteria."
        );

        const formData = new FormData();
        const blob = new Blob([audioBuffer as any], { type: 'audio/webm' });
        formData.append('file', blob, 'audio.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');
        formData.append('prompt', whisperPrompt);

        const response = await fetch(`${OPENAI_API_URL}/audio/transcriptions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Whisper API failed: ${error}`);
        }

        const data = await response.json() as any;
        return data.text;
    },

    async validateKey(apiKey: string): Promise<boolean> {
        try {
            const response = await fetch(`${OPENAI_API_URL}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
            });
            return response.ok;
        } catch (error) {
            console.error("API Key Validation Error:", error);
            return false;
        }
    },

    isValidTranscript(text: string): boolean {
        if (!text) return false;
        if (text.length < 15) return false;

        const hallucinations = [
            "Subtitle by Amara", "Thank you for watching", "Thanks for watching",
            "Like and subscribe", "Copyright", "All rights reserved"
        ];

        for (const h of hallucinations) {
            if (text.includes(h)) return false;
        }
        return true;
    },

    async summarizeMeeting(transcript: string): Promise<string> {
        if (!this.isValidTranscript(transcript)) {
            return "Insufficient or invalid content. Please record more audio.";
        }

        const prompt = `SYSTEM DIRECTIVE: LAZY APP - DIRECT EXECUTIVE MEETING NOTES
        You are the intelligence layer of the LAZY app. You are a highly efficient, invisible Business Analyst taking notes directly inside a live meeting.

        CRITICAL STRIKE RULES (DO NOT VIOLATE):

        ZERO META-COMMENTARY: NEVER use the words "transcript," "recording," "speaker," "audio," or "text." Do NOT write "The transcript reveals..." or "In this meeting...". Act as if you are documenting facts natively.

        NO CONSULTANT JARGON: NEVER use words like "Strategically," "Core opportunity," or "Multifunctional." Speak in plain, direct, sharp business English.

        NO DENSE PARAGRAPHS: You must use the exact Markdown formatting below. Do not output massive walls of text.

        REQUIRED OUTPUT FORMAT (You MUST use these exact Markdown headers):

        TL;DR
        A brutal, 1-sentence bottom-line of the entire meeting.

        Summary
        A direct, 1-2 sentence overview of the meeting's purpose and main topic.

        Key Discussion Points
        Capture the core facts, features, technical details, and problems discussed.

        Use clean, context-rich bullet points.

        Keep the technical nuance (e.g., SLAs, AVD deployments, specific software or hardware) but strip out all conversational fluff.

        Action Items
        Extract specific tasks, next steps, or assignments as bullet points.

        If no specific action items were assigned, write: "No specific action items assigned."

        Conclusion
        A brief 1-sentence wrap-up stating the final consensus, decision made, or how the meeting ended.

        Transcript:
        ${transcript}`;

        return this._callGPT(prompt);
    },

    async generateStory(overview: string): Promise<{ summary: string; description: string }> {
        if (!this.isValidTranscript(overview)) {
            return {
                summary: "Input too short",
                description: "Insufficient content to generate a strategic insight. Please record more detail."
            };
        }

        const prompt = `SYSTEM DIRECTIVE: DIRECT EXECUTIVE WORK STORY
        You are a highly efficient, invisible technical assistant. Your job is to process a raw audio dictation from a developer or Business Analyst and convert it into a clean, structured work record.

        ABSOLUTE RULES (DO NOT VIOLATE):

        NO META-COMMENTARY: NEVER refer to the "transcript," "audio," "speaker," or the fact that this is a recording. Act as the direct voice of the worker logging the details.

        NO EMOJIS OR FLUFF: Do not use emojis. Speak in direct, plain technical English. Strip out conversational filler.

        NO AGILE TEMPLATES: Do not use the "As a user, I want, so that" format unless the speaker explicitly dictates it.

        REQUIRED FORMAT (Use these exact Markdown headers):

        Summary
        A single, short, punchy sentence that acts as the Title of this work ticket. (e.g., "Implement OAuth2 login flow for the mobile app.")

        Description
        Provide a clean, context-rich breakdown of the work, feature, or problem described.

        Use concise bullet points to capture the technical details, logic, or decisions made.

        Acceptance Criteria
        Scout the text specifically for conditions of success (e.g., "This needs to support 10k users," "The button must be blue," "It should throw an error if...").

        Format these as clear, testable bullet points.

        If absolutely no criteria are mentioned or implied, write "Not specified."

        Action Items
        Extract any specific next steps, dependencies, or blockers that need to be tackled.

        If none are mentioned, write "No action items."
        
        Raw Input:
        ${overview}
        
        Return ONLY the Markdown text.`;

        const response = await this._callGPT(prompt, false);

        // We return a shape compatible with the frontend for now, but 'summary' will just be a title extraction
        // and 'description' will be the full markdown.
        const summary = overview.split(' ').slice(0, 10).join(' ') + "..."; // Simple title from input
        return { summary, description: response };
    },

    async polishComment(comment: string): Promise<string> {
        if (!this.isValidTranscript(comment)) return "Input too short to polish.";

        const prompt = `SYSTEM DIRECTIVE: DIRECT EXECUTIVE COMMENT POLISHER
        You are a highly efficient technical assistant. Your job is to convert rough dictation into a clean, professional status update or ticket comment.

        ABSOLUTE RULES (DO NOT VIOLATE):

        THE GOLDILOCKS LENGTH: Keep it simple and balanced. Aim for concise sentences ( no treshold) that perfectly summarize what was done or said. It must not be an overly long essay, nor an overly short fragment.

        NO META-COMMENTARY: NEVER refer to the "transcript" or "audio." Write directly as the person giving the update (e.g., use phrases like "Updated the schema..." or "Investigated the bug...").

        NO HEADERS OR EMOJIS: Output only the raw paragraph(s).

        BOLD KEYWORDS: Bold key technical terms, system names, or specific metrics (e.g., API, Database, Next.js) to make the comment easily scannable.

        Raw dictation:
        ${comment}

        Return only the polished comment text, no prefix or formatting.`;

        return this._callGPT(prompt);
    },

    async _callGPT(prompt: string, jsonMode: boolean = false): Promise<string> {
        const apiKey = Store.getApiKey();
        if (!apiKey) throw new Error("OpenAI API Key not found");

        const body: any = {
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
        };

        if (jsonMode) {
            body.response_format = { type: 'json_object' };
        }

        const response = await fetch(`${OPENAI_API_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`GPT API failed: ${error}`);
        }

        const data = await response.json() as any;
        return data.choices[0].message.content;
    }
};
