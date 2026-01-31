/*
  # LAZY Application Schema

  1. New Tables
    - `transcripts`
      - `id` (uuid, primary key)
      - `title` (text) - Auto-generated or user-provided title
      - `content` (text) - Full transcript text
      - `summary` (text, nullable) - AI-generated summary
      - `duration` (integer) - Recording duration in seconds
      - `recording_date` (timestamptz) - When the recording was made
      - `created_at` (timestamptz) - Record creation timestamp
      - `metadata` (jsonb, nullable) - Additional metadata (participants, etc.)
    
    - `work_stories`
      - `id` (uuid, primary key)
      - `title` (text) - Story summary/title
      - `description` (text) - Story description
      - `overview` (text) - Original overview dictation
      - `comments` (jsonb) - Array of comments
      - `status` (text) - draft, completed, exported
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `metadata` (jsonb, nullable) - Additional metadata

  2. Security
    - Enable RLS on all tables
    - Public access for this demo (no auth required)
    - In production, you'd restrict to authenticated users only
*/

-- Create transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  summary text,
  duration integer NOT NULL DEFAULT 0,
  recording_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  metadata jsonb
);

-- Create work_stories table
CREATE TABLE IF NOT EXISTS work_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  overview text NOT NULL,
  comments jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb
);

-- Enable RLS
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_stories ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (demo mode)
-- In production, replace with proper auth policies
CREATE POLICY "Allow public read access to transcripts"
  ON transcripts FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public insert to transcripts"
  ON transcripts FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow public update to transcripts"
  ON transcripts FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete from transcripts"
  ON transcripts FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "Allow public read access to work_stories"
  ON work_stories FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public insert to work_stories"
  ON work_stories FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow public update to work_stories"
  ON work_stories FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete from work_stories"
  ON work_stories FOR DELETE
  TO anon
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transcripts_created_at ON transcripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_recording_date ON transcripts(recording_date DESC);
CREATE INDEX IF NOT EXISTS idx_work_stories_created_at ON work_stories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_stories_status ON work_stories(status);
