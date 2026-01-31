export interface AppSettings {
  claudeApiKey: string;
  whisperApiKey: string;
  whisperProvider: 'openai' | 'groq';
  claudeModel: string;
  claudeMaxTokens: number;
  autoSaveDrafts: boolean;
}

export interface MeetingTranscript {
  transcript: string;
  summary: string;
  duration: number;
  timestamp: Date;
}

export interface WorkStory {
  summary: string;
  description: string;
  comments: string[];
  timestamp: Date;
}

export type AppMode = 'meeting' | 'work-tracker';

export interface AudioDevice {
  deviceId: string;
  label: string;
}
