import { Mic, FileText, ArrowRight, Zap } from 'lucide-react';
import { AppMode } from '../types';

interface LandingPageProps {
  onSelectMode: (mode: AppMode) => void;
}

export function LandingPage({ onSelectMode }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      <div className="absolute top-20 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
      <div className="absolute top-40 right-20 w-72 h-72 bg-green-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000" />

      <div className="max-w-6xl w-full relative z-10">
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-sm text-gray-600 mb-6 border border-gray-200">
            <Zap size={14} className="text-orange-500" />
            <span className="font-medium">AI-Powered Productivity</span>
          </div>

          <h1 className="text-7xl font-bold mb-4 text-gray-900 tracking-tight">
            LAZY
          </h1>
          <p className="text-xl text-gray-600 mb-2 font-medium">Local Audio-to-YAML Jira Engine</p>
          <p className="text-base text-gray-500">Choose your workflow to get started</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          <button
            onClick={() => onSelectMode('meeting')}
            className="group relative bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 hover:-translate-y-1 text-left"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Mic className="text-blue-600" size={28} />
              </div>
              <ArrowRight className="text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" size={24} />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Meeting Transcription
            </h2>

            <p className="text-gray-600 leading-relaxed mb-6">
              Record meetings and conversations with real-time audio visualization. Get AI-powered transcriptions and intelligent summaries instantly.
            </p>

            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">
                Audio Recording
              </span>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">
                AI Transcription
              </span>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">
                Smart Summary
              </span>
            </div>
          </button>

          <button
            onClick={() => onSelectMode('work-tracker')}
            className="group relative bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-green-300 hover:shadow-xl hover:shadow-green-500/10 transition-all duration-300 hover:-translate-y-1 text-left"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-xl bg-green-50 flex items-center justify-center group-hover:bg-green-100 transition-colors">
                <FileText className="text-green-600" size={28} />
              </div>
              <ArrowRight className="text-gray-400 group-hover:text-green-600 group-hover:translate-x-1 transition-all" size={24} />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Work Tracker
            </h2>

            <p className="text-gray-600 leading-relaxed mb-6">
              Dictate work stories and let AI generate professional Jira-ready tickets. Export formatted stories ready for your project management tool.
            </p>

            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-semibold">
                Voice Dictation
              </span>
              <span className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-semibold">
                AI Generation
              </span>
              <span className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-semibold">
                Jira Format
              </span>
            </div>
          </button>
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-gray-500">
            Powered by Claude AI • Secure & Private • Locally Stored
          </p>
        </div>
      </div>
    </div>
  );
}
