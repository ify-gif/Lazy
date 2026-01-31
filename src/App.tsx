import { useState, useEffect } from 'react';
import { Settings, Moon, Sun, Home } from 'lucide-react';
import { LandingPage } from './components/LandingPage';
import { PremiumMeetingMode } from './components/PremiumMeetingMode';
import { PremiumWorkTrackerMode } from './components/PremiumWorkTrackerMode';
import { SettingsDialog } from './components/SettingsDialog';
import { HistorySidebar } from './components/HistorySidebar';
import { ToastContainer } from './components/Toast';
import { useToast } from './hooks/useToast';
import { AppMode, AppSettings } from './types';
import { Transcript, WorkStoryDB } from './lib/supabase';

const DEFAULT_SETTINGS: AppSettings = {
  claudeApiKey: '',
  whisperApiKey: '',
  whisperProvider: 'groq',
  claudeModel: 'claude-sonnet-4-5-20250929',
  claudeMaxTokens: 4000,
  autoSaveDrafts: true,
};

function App() {
  const [mode, setMode] = useState<AppMode | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const { toasts, dismissToast, success, error, info, warning } = useToast();

  useEffect(() => {
    const savedSettings = localStorage.getItem('lazy-settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    const savedDarkMode = localStorage.getItem('lazy-dark-mode');
    if (savedDarkMode) {
      setDarkMode(savedDarkMode === 'true');
    }
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('lazy-dark-mode', darkMode.toString());
  }, [darkMode]);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('lazy-settings', JSON.stringify(newSettings));
    success('Settings saved successfully!');
  };

  const handleHistorySelect = (item: Transcript | WorkStoryDB) => {
    setIsHistoryOpen(false);
    info('Item loaded from history');
  };

  const handleToast = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    switch (type) {
      case 'success':
        success(message);
        break;
      case 'error':
        error(message);
        break;
      case 'info':
        info(message);
        break;
      case 'warning':
        warning(message);
        break;
    }
  };

  if (!mode) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <LandingPage onSelectMode={setMode} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'dark' : ''}`}>
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white shadow-xl">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMode(null)}
              className="p-2.5 hover:bg-gray-700 rounded-lg transition-colors"
              title="Back to Home"
            >
              <Home size={20} />
            </button>
            <div className="h-8 w-px bg-gray-700" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                LAZY
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {mode === 'meeting' ? 'Meeting Transcription Mode' : 'Work Tracker Mode'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 hover:bg-gray-700 rounded-lg transition-colors"
              title={darkMode ? 'Light Mode' : 'Dark Mode'}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 hover:bg-gray-700 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {mode === 'meeting' ? (
          <PremiumMeetingMode
            settings={settings}
            onShowHistory={() => setIsHistoryOpen(true)}
            onToast={handleToast}
          />
        ) : (
          <PremiumWorkTrackerMode
            settings={settings}
            onShowHistory={() => setIsHistoryOpen(true)}
            onToast={handleToast}
          />
        )}
      </div>

      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-gray-400 px-6 py-3 text-xs flex items-center justify-between border-t border-gray-700">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Ready
          </span>
          <span className="text-gray-600">•</span>
          <span>v1.0.0</span>
        </div>
        <span className="text-gray-600">
          {mode === 'meeting' ? 'Meeting Transcription Mode' : 'Work Tracker Mode'}
        </span>
      </div>

      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <HistorySidebar
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        mode={mode}
        onSelect={handleHistorySelect}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
