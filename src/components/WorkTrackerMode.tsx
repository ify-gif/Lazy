import { useState, useEffect, useRef } from 'react';
import { Mic, FileText, Plus, Save, Download } from 'lucide-react';
import { AudioRecorder } from '../audioRecorder';
import { APIClient } from '../apiClient';
import { AppSettings, WorkStory } from '../types';

interface WorkTrackerModeProps {
  settings: AppSettings;
}

export function WorkTrackerMode({ settings }: WorkTrackerModeProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [overviewText, setOverviewText] = useState('');
  const [currentComment, setCurrentComment] = useState('');
  const [story, setStory] = useState<WorkStory | null>(null);
  const [isRecordingOverview, setIsRecordingOverview] = useState(false);
  const [isRecordingComment, setIsRecordingComment] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [isPolishingComment, setIsPolishingComment] = useState(false);
  const [error, setError] = useState('');

  const recorderRef = useRef<AudioRecorder>(new AudioRecorder());

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

  const startRecordingOverview = async () => {
    try {
      setError('');
      await recorderRef.current.startRecording(selectedDevice);
      setIsRecordingOverview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  const stopRecordingOverview = async () => {
    try {
      const audioBlob = await recorderRef.current.stopRecording();
      setIsRecordingOverview(false);
      setIsTranscribing(true);

      if (!settings.whisperApiKey) {
        setError('Please configure Whisper API key in Settings');
        setIsTranscribing(false);
        return;
      }

      const apiClient = new APIClient(
        settings.claudeApiKey,
        settings.whisperApiKey,
        settings.whisperProvider
      );

      const transcribedText = await apiClient.transcribeAudio(audioBlob);
      setOverviewText(transcribedText);
      setIsTranscribing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transcribe audio');
      setIsTranscribing(false);
    }
  };

  const generateStory = async () => {
    if (!overviewText) return;

    try {
      setError('');
      setIsGeneratingStory(true);

      if (!settings.claudeApiKey) {
        setError('Please configure Claude API key in Settings');
        setIsGeneratingStory(false);
        return;
      }

      const apiClient = new APIClient(
        settings.claudeApiKey,
        settings.whisperApiKey,
        settings.whisperProvider
      );

      const { summary, description } = await apiClient.generateStoryFromOverview(overviewText);

      setStory({
        summary,
        description,
        comments: [],
        timestamp: new Date(),
      });

      setIsGeneratingStory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate story');
      setIsGeneratingStory(false);
    }
  };

  const startRecordingComment = async () => {
    try {
      setError('');
      await recorderRef.current.startRecording(selectedDevice);
      setIsRecordingComment(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  const stopRecordingComment = async () => {
    try {
      const audioBlob = await recorderRef.current.stopRecording();
      setIsRecordingComment(false);
      setIsTranscribing(true);

      if (!settings.whisperApiKey) {
        setError('Please configure Whisper API key in Settings');
        setIsTranscribing(false);
        return;
      }

      const apiClient = new APIClient(
        settings.claudeApiKey,
        settings.whisperApiKey,
        settings.whisperProvider
      );

      const transcribedText = await apiClient.transcribeAudio(audioBlob);
      setCurrentComment(transcribedText);
      setIsTranscribing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transcribe audio');
      setIsTranscribing(false);
    }
  };

  const addComment = async () => {
    if (!currentComment || !story) return;

    try {
      setError('');
      setIsPolishingComment(true);

      if (!settings.claudeApiKey) {
        setError('Please configure Claude API key in Settings');
        setIsPolishingComment(false);
        return;
      }

      const apiClient = new APIClient(
        settings.claudeApiKey,
        settings.whisperApiKey,
        settings.whisperProvider
      );

      const polishedComment = await apiClient.polishComment(currentComment);

      setStory({
        ...story,
        comments: [...story.comments, polishedComment],
      });

      setCurrentComment('');
      setIsPolishingComment(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to polish comment');
      setIsPolishingComment(false);
    }
  };

  const exportStory = () => {
    if (!story) return;

    const timestamp = story.timestamp.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const commentsSection = story.comments
      .map((comment, index) => `COMMENT ${index + 1}\n${comment}`)
      .join('\n\n');

    const content = `LAZY Work Story
Created: ${timestamp}

SUMMARY
${story.summary}

DESCRIPTION
${story.description}

${commentsSection}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const slug = story.summary
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);

    const fileDate = new Date().toISOString().slice(0, 10);
    a.download = `${slug}_${fileDate}.txt`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearStory = () => {
    if (story && !confirm('Clear current story? This will discard all unsaved work.')) {
      return;
    }

    setStory(null);
    setOverviewText('');
    setCurrentComment('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b shadow-sm px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <FileText className="text-green-600" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Work Tracker</h2>
                <p className="text-xs text-gray-500">Create Jira-ready work stories</p>
              </div>
            </div>

            <button
              onClick={clearStory}
              className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear Story
            </button>
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
        <div className="max-w-7xl mx-auto h-full flex gap-6">
          <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
            {!story ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <div className="max-w-2xl">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Create New Story</h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Dictate or type an overview of your work story to get started
                  </p>

                  <div className="mb-4">
                    <button
                      onMouseDown={startRecordingOverview}
                      onMouseUp={stopRecordingOverview}
                      onMouseLeave={() => {
                        if (isRecordingOverview) stopRecordingOverview();
                      }}
                      disabled={isTranscribing}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all shadow-sm hover:shadow-md ${
                        isRecordingOverview
                          ? 'bg-red-600 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300 disabled:text-gray-500'
                      }`}
                    >
                      {isRecordingOverview ? (
                        <>
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                          Recording...
                        </>
                      ) : (
                        <>
                          <Mic size={18} />
                          Hold to Record Overview
                        </>
                      )}
                    </button>
                  </div>

                  <textarea
                    value={overviewText}
                    onChange={(e) => setOverviewText(e.target.value)}
                    placeholder="Describe your work story... Include what you're building, the requirements, and any important details."
                    className="w-full h-64 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-800 leading-relaxed"
                  />

                  <button
                    onClick={generateStory}
                    disabled={!overviewText || isGeneratingStory}
                    className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg font-semibold transition-all shadow-sm hover:shadow-md"
                  >
                    <FileText size={18} />
                    {isGeneratingStory ? 'Generating Story...' : 'Generate Story'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-blue-50">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Story Preview</h3>
                  </div>

                  <div className="p-6 space-y-6">
                    <div className="pb-6 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                        Summary
                      </h4>
                      <p className="text-lg font-semibold text-gray-900">{story.summary}</p>
                    </div>

                    <div className="pb-6 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                        Description
                      </h4>
                      <p className="text-gray-700 leading-relaxed">{story.description}</p>
                    </div>

                    {story.comments.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">
                          Comments ({story.comments.length})
                        </h4>
                        <div className="space-y-4">
                          {story.comments.map((comment, index) => (
                            <div key={index} className="pl-4 border-l-2 border-blue-200">
                              <div className="text-xs font-semibold text-blue-600 mb-1">
                                Comment {index + 1}
                              </div>
                              <p className="text-gray-700 text-sm leading-relaxed">{comment}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={exportStory}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-semibold transition-all shadow-sm hover:shadow-md"
                  >
                    <Download size={18} />
                    Export Story
                  </button>
                </div>
              </>
            )}
          </div>

          {story && (
            <div className="w-96 flex flex-col gap-4">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Add Comment</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Record or type additional comments to add to your story
                </p>

                <div className="mb-4">
                  <button
                    onMouseDown={startRecordingComment}
                    onMouseUp={stopRecordingComment}
                    onMouseLeave={() => {
                      if (isRecordingComment) stopRecordingComment();
                    }}
                    disabled={isTranscribing}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all shadow-sm hover:shadow-md w-full justify-center ${
                      isRecordingComment
                        ? 'bg-red-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300 disabled:text-gray-500'
                    }`}
                  >
                    {isRecordingComment ? (
                      <>
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        Recording...
                      </>
                    ) : (
                      <>
                        <Mic size={18} />
                        Hold to Record
                      </>
                    )}
                  </button>
                </div>

                <textarea
                  value={currentComment}
                  onChange={(e) => setCurrentComment(e.target.value)}
                  placeholder="Add implementation details, notes, or updates..."
                  className="w-full h-40 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-800 leading-relaxed mb-4"
                />

                <button
                  onClick={addComment}
                  disabled={!currentComment || isPolishingComment}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg font-semibold transition-all shadow-sm hover:shadow-md w-full justify-center"
                >
                  <Plus size={18} />
                  {isPolishingComment ? 'Adding Comment...' : 'Add Comment'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
