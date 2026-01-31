import { useState, useEffect, useRef } from 'react';
import {
  Mic,
  FileText,
  Plus,
  Download,
  Copy,
  History,
  Sparkles,
  Save,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { AudioRecorder } from '../audioRecorder';
import { APIClient } from '../apiClient';
import { AppSettings, WorkStory } from '../types';
import { supabase, WorkStoryDB } from '../lib/supabase';

interface PremiumWorkTrackerModeProps {
  settings: AppSettings;
  onShowHistory: () => void;
  onToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export function PremiumWorkTrackerMode({
  settings,
  onShowHistory,
  onToast,
}: PremiumWorkTrackerModeProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [overviewText, setOverviewText] = useState('');
  const [currentComment, setCurrentComment] = useState('');
  const [story, setStory] = useState<WorkStory | null>(null);
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
  const [isRecordingOverview, setIsRecordingOverview] = useState(false);
  const [isRecordingComment, setIsRecordingComment] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [isPolishingComment, setIsPolishingComment] = useState(false);

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
      onToast('Failed to access microphone. Please grant permissions.', 'error');
    }
  };

  const startRecordingOverview = async () => {
    try {
      await recorderRef.current.startRecording(selectedDevice);
      setIsRecordingOverview(true);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to start recording', 'error');
    }
  };

  const stopRecordingOverview = async () => {
    try {
      const audioBlob = await recorderRef.current.stopRecording();
      setIsRecordingOverview(false);
      setIsTranscribing(true);

      if (!settings.whisperApiKey) {
        onToast('Please configure Whisper API key in Settings', 'error');
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
      onToast('Overview transcribed!', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to transcribe audio', 'error');
      setIsTranscribing(false);
    }
  };

  const generateStory = async () => {
    if (!overviewText) return;

    try {
      setIsGeneratingStory(true);

      if (!settings.claudeApiKey) {
        onToast('Please configure Claude API key in Settings', 'error');
        setIsGeneratingStory(false);
        return;
      }

      const apiClient = new APIClient(
        settings.claudeApiKey,
        settings.whisperApiKey,
        settings.whisperProvider
      );

      onToast('Generating story with AI...', 'info');
      const { summary, description } = await apiClient.generateStoryFromOverview(overviewText);

      setStory({
        summary,
        description,
        comments: [],
        timestamp: new Date(),
      });

      setIsGeneratingStory(false);
      onToast('Story generated!', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to generate story', 'error');
      setIsGeneratingStory(false);
    }
  };

  const startRecordingComment = async () => {
    try {
      await recorderRef.current.startRecording(selectedDevice);
      setIsRecordingComment(true);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to start recording', 'error');
    }
  };

  const stopRecordingComment = async () => {
    try {
      const audioBlob = await recorderRef.current.stopRecording();
      setIsRecordingComment(false);
      setIsTranscribing(true);

      if (!settings.whisperApiKey) {
        onToast('Please configure Whisper API key in Settings', 'error');
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
      onToast('Comment transcribed!', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to transcribe audio', 'error');
      setIsTranscribing(false);
    }
  };

  const addComment = async () => {
    if (!currentComment || !story) return;

    try {
      setIsPolishingComment(true);

      if (!settings.claudeApiKey) {
        onToast('Please configure Claude API key in Settings', 'error');
        setIsPolishingComment(false);
        return;
      }

      const apiClient = new APIClient(
        settings.claudeApiKey,
        settings.whisperApiKey,
        settings.whisperProvider
      );

      onToast('Polishing comment with AI...', 'info');
      const polishedComment = await apiClient.polishComment(currentComment);

      setStory({
        ...story,
        comments: [...story.comments, polishedComment],
      });

      setCurrentComment('');
      setIsPolishingComment(false);
      onToast('Comment added!', 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to polish comment', 'error');
      setIsPolishingComment(false);
    }
  };

  const removeComment = (index: number) => {
    if (!story) return;
    setStory({
      ...story,
      comments: story.comments.filter((_, i) => i !== index),
    });
    onToast('Comment removed', 'info');
  };

  const saveStory = async () => {
    if (!story) return;

    try {
      const storyData = {
        title: story.summary,
        description: story.description,
        overview: overviewText,
        comments: story.comments,
        status: 'draft' as const,
      };

      if (currentStoryId) {
        const { error } = await supabase
          .from('work_stories')
          .update({ ...storyData, updated_at: new Date().toISOString() })
          .eq('id', currentStoryId);

        if (error) throw error;
        onToast('Story updated!', 'success');
      } else {
        const { data, error } = await supabase.from('work_stories').insert(storyData).select();

        if (error) throw error;
        if (data && data[0]) {
          setCurrentStoryId(data[0].id);
        }
        onToast('Story saved!', 'success');
      }
    } catch (error) {
      onToast('Failed to save story', 'error');
      console.error('Error saving story:', error);
    }
  };

  const exportStory = async () => {
    if (!story) return;

    await saveStory();

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

    onToast('Story exported!', 'success');

    if (currentStoryId) {
      await supabase
        .from('work_stories')
        .update({ status: 'exported' })
        .eq('id', currentStoryId);
    }
  };

  const copyStory = async () => {
    if (!story) return;

    const content = `${story.summary}\n\n${story.description}\n\n${story.comments.join('\n\n')}`;
    try {
      await navigator.clipboard.writeText(content);
      onToast('Story copied to clipboard!', 'success');
    } catch (err) {
      onToast('Failed to copy to clipboard', 'error');
    }
  };

  const clearStory = () => {
    if (story && !confirm('Clear current story? This will discard all unsaved work.')) {
      return;
    }

    setStory(null);
    setOverviewText('');
    setCurrentComment('');
    setCurrentStoryId(null);
  };

  const loadStory = (storyData: WorkStoryDB) => {
    setOverviewText(storyData.overview);
    setStory({
      summary: storyData.title,
      description: storyData.description,
      comments: storyData.comments,
      timestamp: new Date(storyData.created_at),
    });
    setCurrentStoryId(storyData.id);
    onToast('Story loaded!', 'success');
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-green-50/30">
      <div className="bg-white border-b shadow-sm px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {story && (
              <>
                <button
                  onClick={clearStory}
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  New
                </button>
                <div className="h-4 w-px bg-gray-300" />
              </>
            )}
            <button
              onClick={onShowHistory}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <History size={18} />
              History
            </button>
          </div>

          {story && (
            <div className="flex items-center gap-2">
              <button
                onClick={saveStory}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow"
              >
                <Save size={16} />
                Save
              </button>
            </div>
          )}
        </div>

        {isTranscribing && (
          <div className="mt-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-4 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            <p className="text-sm font-medium text-blue-800">Transcribing audio with AI...</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex p-6 gap-6">
        {!story ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="max-w-xl w-full bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4">
                  <FileText className="text-white" size={32} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Create Work Story</h2>
                <p className="text-gray-600">
                  Dictate your story overview and let AI generate a professional Jira story
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Story Overview
                  </label>
                  <div className="relative">
                    <button
                      onMouseDown={startRecordingOverview}
                      onMouseUp={stopRecordingOverview}
                      onMouseLeave={() => {
                        if (isRecordingOverview) stopRecordingOverview();
                      }}
                      disabled={isTranscribing}
                      className={`absolute right-3 top-3 flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-all shadow-md ${
                        isRecordingOverview
                          ? 'bg-gradient-to-r from-red-500 to-red-600 animate-pulse'
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500'
                      }`}
                    >
                      <Mic size={18} />
                      {isRecordingOverview ? 'Recording...' : 'Hold to Record'}
                    </button>
                    <textarea
                      value={overviewText}
                      onChange={(e) => setOverviewText(e.target.value)}
                      placeholder="Record or type your story overview here. Describe what you want to build, the problem you're solving, and any key requirements..."
                      className="w-full h-48 px-4 py-3 pr-36 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none text-sm leading-relaxed"
                    />
                  </div>
                </div>

                <button
                  onClick={generateStory}
                  disabled={!overviewText || isGeneratingStory}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
                >
                  <Sparkles size={20} />
                  {isGeneratingStory ? 'Generating Story...' : 'Generate Story with AI'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="text-green-600" size={24} />
                  <h2 className="text-xl font-bold text-gray-800">Story Preview</h2>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                      Summary
                    </label>
                    <input
                      type="text"
                      value={story.summary}
                      onChange={(e) => setStory({ ...story, summary: e.target.value })}
                      className="w-full px-4 py-2 text-lg font-semibold text-gray-800 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                      Description
                    </label>
                    <textarea
                      value={story.description}
                      onChange={(e) => setStory({ ...story, description: e.target.value })}
                      className="w-full h-32 px-4 py-3 text-gray-800 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none"
                    />
                  </div>

                  {story.comments.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                        Comments ({story.comments.length})
                      </label>
                      <div className="space-y-3">
                        {story.comments.map((comment, index) => (
                          <div
                            key={index}
                            className="group relative bg-gray-50 border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                          >
                            <button
                              onClick={() => removeComment(index)}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                            <p className="text-sm text-gray-700 pr-8">{comment}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={copyStory}
                  className="flex items-center gap-2 px-5 py-2.5 text-gray-700 bg-white hover:bg-gray-50 border-2 border-gray-300 rounded-lg font-medium transition-colors shadow"
                >
                  <Copy size={18} />
                  Copy
                </button>
                <button
                  onClick={exportStory}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
                >
                  <Download size={18} />
                  Export Story
                </button>
              </div>
            </div>

            <div className="w-96 flex flex-col gap-4">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Add Comment</h3>

                <div className="space-y-4">
                  <div className="relative">
                    <button
                      onMouseDown={startRecordingComment}
                      onMouseUp={stopRecordingComment}
                      onMouseLeave={() => {
                        if (isRecordingComment) stopRecordingComment();
                      }}
                      disabled={isTranscribing}
                      className={`absolute right-3 top-3 z-10 flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-white text-sm transition-all shadow ${
                        isRecordingComment
                          ? 'bg-gradient-to-r from-red-500 to-red-600 animate-pulse'
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500'
                      }`}
                    >
                      <Mic size={16} />
                      {isRecordingComment ? 'Recording...' : 'Record'}
                    </button>
                    <textarea
                      value={currentComment}
                      onChange={(e) => setCurrentComment(e.target.value)}
                      placeholder="Dictate or type additional details, technical notes, acceptance criteria..."
                      className="w-full h-40 px-4 py-3 pr-28 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none text-sm leading-relaxed"
                    />
                  </div>

                  <button
                    onClick={addComment}
                    disabled={!currentComment || isPolishingComment}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
                  >
                    <Plus size={18} />
                    {isPolishingComment ? 'Polishing...' : 'Polish & Add Comment'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
