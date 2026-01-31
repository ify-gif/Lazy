export class APIClient {
  private claudeApiKey: string;
  private whisperApiKey: string;
  private whisperProvider: 'openai' | 'groq';

  constructor(claudeApiKey: string, whisperApiKey: string, whisperProvider: 'openai' | 'groq') {
    this.claudeApiKey = claudeApiKey;
    this.whisperApiKey = whisperApiKey;
    this.whisperProvider = whisperProvider;
  }

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');

    let url: string;
    let headers: HeadersInit;

    if (this.whisperProvider === 'openai') {
      url = 'https://api.openai.com/v1/audio/transcriptions';
      headers = {
        'Authorization': `Bearer ${this.whisperApiKey}`,
      };
    } else {
      url = 'https://api.groq.com/openai/v1/audio/transcriptions';
      headers = {
        'Authorization': `Bearer ${this.whisperApiKey}`,
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Transcription failed: ${error}`);
    }

    const data = await response.json();
    return data.text;
  }

  async generateMeetingSummary(transcript: string): Promise<string> {
    const prompt = `Analyze this meeting transcript and create a structured summary.

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
${transcript}`;

    return this.callClaude(prompt);
  }

  async generateStoryFromOverview(overview: string): Promise<{ summary: string; description: string }> {
    const prompt = `You are helping create a Jira story. Convert this dictated overview into:

1. SUMMARY: A concise title (50-100 characters, action-oriented, no period at end)
2. DESCRIPTION: A clear 2-4 sentence description with context and purpose

Overview:
${overview}

Format your response exactly as:
SUMMARY
[Generated summary text]

DESCRIPTION
[Generated description text]`;

    const response = await this.callClaude(prompt);

    const summaryMatch = response.match(/SUMMARY\s*\n(.*?)(?=\n\nDESCRIPTION|\n*$)/s);
    const descriptionMatch = response.match(/DESCRIPTION\s*\n(.*?)$/s);

    return {
      summary: summaryMatch ? summaryMatch[1].trim() : '',
      description: descriptionMatch ? descriptionMatch[1].trim() : '',
    };
  }

  async polishComment(comment: string): Promise<string> {
    const prompt = `You are helping add a comment to a Jira story. Polish this dictated comment into a professional, well-structured paragraph.

Requirements:
- Clear and concise
- Professional tone
- 2-4 sentences
- Expand abbreviations if needed
- Fix grammar/phrasing
- Maintain original meaning and technical details

Raw dictation:
${comment}

Return only the polished comment text, no prefix or formatting.`;

    return this.callClaude(prompt);
  }

  private async callClaude(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API failed: ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }
}
