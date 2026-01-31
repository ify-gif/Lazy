import { useState, useEffect } from 'react';
import { Search, FileText, Clock, Calendar, X, Trash2 } from 'lucide-react';
import { supabase, Transcript, WorkStoryDB } from '../lib/supabase';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'meeting' | 'work-tracker';
  onSelect: (item: Transcript | WorkStoryDB) => void;
}

export function HistorySidebar({ isOpen, onClose, mode, onSelect }: HistorySidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [stories, setStories] = useState<WorkStoryDB[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, mode]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      if (mode === 'meeting') {
        const { data, error } = await supabase
          .from('transcripts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setTranscripts(data || []);
      } else {
        const { data, error } = await supabase
          .from('work_stories')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setStories(data || []);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this item?')) return;

    try {
      const table = mode === 'meeting' ? 'transcripts' : 'work_stories';
      const { error } = await supabase.from(table).delete().eq('id', id);

      if (error) throw error;
      loadHistory();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const filteredTranscripts = transcripts.filter(
    (t) =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStories = stories.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40 animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-2xl z-50 flex flex-col animate-slide-in">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-800">History</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search history..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-24 rounded-lg" />
              ))}
            </div>
          ) : mode === 'meeting' ? (
            <div className="p-4 space-y-2">
              {filteredTranscripts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No transcripts yet</p>
                </div>
              ) : (
                filteredTranscripts.map((transcript) => (
                  <div
                    key={transcript.id}
                    onClick={() => onSelect(transcript)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group bg-white"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-800 text-sm line-clamp-1 flex-1">
                        {transcript.title}
                      </h3>
                      <button
                        onClick={(e) => deleteItem(transcript.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600 ml-2"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2 mb-3">
                      {transcript.content.slice(0, 120)}...
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        <span>{Math.floor(transcript.duration / 60)}m</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        <span>{formatDate(transcript.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {filteredStories.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No stories yet</p>
                </div>
              ) : (
                filteredStories.map((story) => (
                  <div
                    key={story.id}
                    onClick={() => onSelect(story)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group bg-white"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-800 text-sm line-clamp-1 flex-1">
                        {story.title}
                      </h3>
                      <button
                        onClick={(e) => deleteItem(story.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600 ml-2"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2 mb-3">
                      {story.description}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">
                        {story.status}
                      </span>
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        <span>{formatDate(story.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
