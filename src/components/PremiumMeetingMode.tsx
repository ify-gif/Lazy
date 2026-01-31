import { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  FileText,
  Download,
  Copy,
  History,
  Sparkles,
  Save,
  Play,
} from 'lucide-react';
import { AudioRecorder } from '../audioRecorder';
import { APIClient } from '../apiClient';
import { AppSettings } from '../types';
import { WaveformVisualizer } from './WaveformVisualizer';
import { supabase, Transcript } from '../lib/supabase';

interface PremiumMeetingModeProps {
  settings: AppSettings;
  onShowHistory: () => void;
  onToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export function PremiumMeetingMode({ settings, onShowHistory, onToast }: PremiumMeetingModeProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [title, setTitle] = useState('');
  const [currentTranscriptId, setCurrentTranscriptId] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorder>(new AudioRecorder());
  const timerRef = useRef<number>();
  const startTimeRef = useRef<Date>();

  useEffect(() => {
    loadAudioDevices();
  }, []);

  const loadAudioDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const deviceList = await recorderRef.current.getAudioDevices();
      setDevices(deviceList);
      if (deviceList.length > 0 && !selectedDevice) {
        setSelectedDevice(deviceList[0].deviceId);
      }
    } catch (err) {
      onToast('Failed to access microphone. Please grant permissions.', 'error');
    }
  };

  const startRecording = async () => {
    try {
      await recorderRef.current.startRecording(selectedDevice);
      setIsRecording(true);
      setRecordingTime(0);
      startTimeRef.current = new Date();

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      onToast('Recording started', 'info');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to start recording', 'error');
    }
  };

  const stopRecording = async () => {
    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      const audioBlob = await recorderRef.current.stopRecording();
      setIsRecording(false);
      setIsTranscribing(true);

      if (!settings.claudeApiKey || !settings.whisperApiKey) {
        onToast('Please configure API keys in Settings', 'error');
        setIsTranscribing(false);
        return;
      }

      const apiClient = new APIClient(
        settings.claudeApiKey,
        settings.whisperApiKey,
        settings.whisperProvider
      );

      onToast('Transcribing audio...', 'info');
      const transcribedText = await apiClient.transcribeAudio(audioBlob);
      setTranscript(transcribedText);
      setIsTranscribing(false);

      const autoTitle = `Meeting ${new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`;
      setTitle(autoTitle);

      onToast('Transcription complete!', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to transcribe audio', 'error');
      setIsTranscribing(false);
    }
  };

  const generateSummary = async () => {
    if (!transcript) return;

    try {
      setIsGeneratingSummary(true);

      if (!settings.claudeApiKey) {
        onToast('Please configure Claude API key in Settings', 'error');
        setIsGeneratingSummary(false);
        return;
      }

      const apiClient = new APIClient(
        settings.claudeApiKey,
        settings.whisperApiKey,
        settings.whisperProvider
      );

      onToast('Generating AI summary...', 'info');
      const generatedSummary = await apiClient.generateMeetingSummary(transcript);
      setSummary(generatedSummary);
      setIsGeneratingSummary(false);
      onToast('Summary generated!', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to generate summary', 'error');
      setIsGeneratingSummary(false);
    }
  };

  const saveTranscript = async () => {
    if (!transcript) return;

    try {
      const transcriptData = {
        title: title || 'Untitled Meeting',
        content: transcript,
        summary,
        duration: recordingTime,
        recording_date: startTimeRef.current?.toISOString() || new Date().toISOString(),
      };

      if (currentTranscriptId) {
        const { error } = await supabase
          .from('transcripts')
          .update(transcriptData)
          .eq('id', currentTranscriptId);

        if (error) throw error;
        onToast('Transcript updated!', 'success');
      } else {
        const { data, error } = await supabase.from('transcripts').insert(transcriptData).select();

        if (error) throw error;
        if (data && data[0]) {
          setCurrentTranscriptId(data[0].id);
        }
        onToast('Transcript saved!', 'success');
      }
    } catch (error) {
      onToast('Failed to save transcript', 'error');
      console.error('Error saving transcript:', error);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast(`${label} copied to clipboard!`, 'success');
    } catch (err) {
      onToast('Failed to copy to clipboard', 'error');
    }
  };

  const exportAsText = () => {
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const duration = Math.floor(recordingTime / 60);

    const content = `LAZY Meeting Transcript
Date: ${timestamp}
Duration: ${duration} minutes
Title: ${title || 'Untitled Meeting'}

=== TRANSCRIPT ===
${transcript}

=== SUMMARY ===
${summary || 'No summary generated'}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const fileTimestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '');
    a.download = `meeting_${fileTimestamp}.txt`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onToast('File downloaded!', 'success');
  };

  const loadTranscript = (transcriptData: Transcript) => {
    setTitle(transcriptData.title);
    setTranscript(transcriptData.content);
    setSummary(transcriptData.summary || '');
    setRecordingTime(transcriptData.duration);
    setCurrentTranscriptId(transcriptData.id);
    onToast('Transcript loaded!', 'success');
  };

  const newTranscript = () => {
    if (transcript && !confirm('Start a new transcript? Unsaved changes will be lost.')) {
      return;
    }
    setTitle('');
    setTranscript('');
    setSummary('');
    setRecordingTime(0);
    setCurrentTranscriptId(null);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-blue-50/30">
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting Title..."
              className="text-xl font-semibold text-gray-800 border-none outline-none bg-transparent flex-1 placeholder-gray-400"
            />
            <button
              onClick={onShowHistory}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <History size={18} />
              History
            </button>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">Input:</label>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                disabled={isRecording}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 bg-white"
              >
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing}
                className={`relative flex items-center gap-3 px-6 py-3 rounded-xl font-semibold text-white transition-all shadow-lg hover:shadow-xl transform hover:scale-105 ${
                  isRecording
                    ? 'bg-gradient-to-r from-red-500 to-red-600'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 disabled:from-gray-400 disabled:to-gray-500'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square size={20} className="animate-pulse" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic size={20} />
                    Start Recording
                  </>
                )}
              </button>
              {isRecording && (
                <div className="absolute inset-0 rounded-xl border-4 border-red-400 animate-pulse-ring pointer-events-none" />
              )}
            </div>

            {isRecording && (
              <div className="flex items-center gap-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-mono font-semibold text-red-700">
                  {formatTime(recordingTime)}
                </span>
              </div>
            )}

            {transcript && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={newTranscript}
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  New
                </button>
                <button
                  onClick={saveTranscript}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow"
                >
                  <Save size={16} />
                  Save
                </button>
              </div>
            )}
          </div>
        </div>

        {isRecording && (
          <div className="px-6 pb-4">
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-4 border border-blue-200">
              <WaveformVisualizer
                isRecording={isRecording}
                stream={recorderRef.current.getStream()}
              />
            </div>
          </div>
        )}

        {isTranscribing && (
          <div className="px-6 pb-4">
            <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-4 flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
              <p className="text-sm font-medium text-blue-800">
                Transcribing audio with AI...
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden p-6 flex gap-6">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Transcript</h3>
                {transcript && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {wordCount} words • {Math.ceil(wordCount / 150)} min read
                  </p>
                )}
              </div>
              {transcript && (
                <button
                  onClick={() => copyToClipboard(transcript, 'Transcript')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <Copy size={14} />
                  Copy
                </button>
              )}
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your transcript will appear here after recording... You can also paste or type directly."
              className="flex-1 w-full px-4 py-3 focus:outline-none resize-none text-sm leading-relaxed text-gray-700"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={generateSummary}
              disabled={!transcript || isGeneratingSummary}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg transform hover:scale-105 disabled:transform-none"
            >
              <Sparkles size={18} />
              {isGeneratingSummary ? 'Generating...' : 'Generate AI Summary'}
            </button>

            <button
              onClick={exportAsText}
              disabled={!transcript}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-800 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors shadow-md"
            >
              <Download size={18} />
              Export
            </button>
          </div>
        </div>

        {summary && (
          <div className="w-96 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-slide-in">
            <div className="px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-pink-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-600" />
                <h3 className="font-semibold text-gray-800">AI Summary</h3>
              </div>
              <button
                onClick={() => copyToClipboard(summary, 'Summary')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white/50 rounded-md transition-colors"
              >
                <Copy size={14} />
                Copy
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
                {summary}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
