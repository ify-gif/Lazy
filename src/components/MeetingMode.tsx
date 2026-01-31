import { useState, useEffect, useRef } from 'react';
import { Mic, Square, FileText, Download } from 'lucide-react';
import { AudioRecorder } from '../audioRecorder';
import { APIClient } from '../apiClient';
import { AppSettings } from '../types';

interface MeetingModeProps {
  settings: AppSettings;
}

export function MeetingMode({ settings }: MeetingModeProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [error, setError] = useState('');

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
      setError('Failed to access microphone. Please grant permissions.');
    }
  };

  const startRecording = async () => {
    try {
      setError('');
      await recorderRef.current.startRecording(selectedDevice);
      setIsRecording(true);
      setRecordingTime(0);
      startTimeRef.current = new Date();

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
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
        setError('Please configure API keys in Settings');
        setIsTranscribing(false);
        return;
      }

      const apiClient = new APIClient(
        settings.claudeApiKey,
        settings.whisperApiKey,
        settings.whisperProvider
      );

      const transcribedText = await apiClient.transcribeAudio(audioBlob);
      setTranscript(transcribedText);
      setIsTranscribing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transcribe audio');
      setIsTranscribing(false);
    }
  };

  const generateSummary = async () => {
    if (!transcript) return;

    try {
      setError('');
      setIsGeneratingSummary(true);

      if (!settings.claudeApiKey) {
        setError('Please configure Claude API key in Settings');
        setIsGeneratingSummary(false);
        return;
      }

      const apiClient = new APIClient(
        settings.claudeApiKey,
        settings.whisperApiKey,
        settings.whisperProvider
      );

      const generatedSummary = await apiClient.generateMeetingSummary(transcript);
      setSummary(generatedSummary);
      setIsGeneratingSummary(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
      setIsGeneratingSummary(false);
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

=== TRANSCRIPT ===
${transcript}

=== SUMMARY ===
${summary}`;

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
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b shadow-sm px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Mic className="text-blue-600" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Meeting Transcription</h2>
                  <p className="text-xs text-gray-500">Record and transcribe conversations</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <label className="text-xs font-medium text-gray-500 mb-1">Audio Input</label>
                <select
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  disabled={isRecording}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                {isRecording && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-red-50 rounded-lg">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm font-mono font-semibold text-red-700">
                      {formatTime(recordingTime)}
                    </span>
                  </div>
                )}

                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all shadow-sm hover:shadow-md ${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300 disabled:text-gray-500'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square size={18} fill="currentColor" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <Mic size={18} />
                      Start Recording
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 px-8 py-4">
          <div className="max-w-7xl mx-auto">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        </div>
      )}

      {isTranscribing && (
        <div className="bg-blue-50 border-l-4 border-blue-500 px-8 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
              <p className="text-sm font-medium text-blue-800">Transcribing audio...</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden p-8">
        <div className="max-w-7xl mx-auto h-full flex flex-col gap-6">
          <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Transcript</h3>
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your transcript will appear here after recording. You can also edit it directly..."
              className="flex-1 w-full px-6 py-4 focus:outline-none resize-none text-gray-800 leading-relaxed"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={generateSummary}
              disabled={!transcript || isGeneratingSummary}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg font-semibold transition-all shadow-sm hover:shadow-md"
            >
              <FileText size={18} />
              {isGeneratingSummary ? 'Generating Summary...' : 'Generate Summary'}
            </button>

            <button
              onClick={exportAsText}
              disabled={!transcript || !summary}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg font-semibold transition-all shadow-sm hover:shadow-md"
            >
              <Download size={18} />
              Export as Text
            </button>
          </div>

          {summary && (
            <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
                <h3 className="text-sm font-bold text-green-900 uppercase tracking-wide">AI Summary</h3>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 whitespace-pre-wrap text-gray-800 leading-relaxed">
                {summary}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
