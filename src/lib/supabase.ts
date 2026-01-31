import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Transcript {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  duration: number;
  recording_date: string;
  created_at: string;
  metadata: Record<string, any> | null;
}

export interface WorkStoryDB {
  id: string;
  title: string;
  description: string;
  overview: string;
  comments: string[];
  status: 'draft' | 'completed' | 'exported';
  created_at: string;
  updated_at: string;
  metadata: Record<string, any> | null;
}
