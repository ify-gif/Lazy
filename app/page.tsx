"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import SettingsModal from "./components/SettingsModal";

export default function Home() {
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-950">
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Settings Gear */}
      <button
        className="absolute top-10 right-7 z-50 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
        onClick={() => setShowSettings(true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.35a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
      </button>

      <main className="flex flex-col items-center max-w-2xl w-full">
        {/* Hero Image */}
        <div className="w-full max-w-[500px] mb-8 relative">
          <Image
            src="/logo.png"
            alt="LaZy Logo"
            width={500}
            height={200}
            className="w-full h-auto drop-shadow-sm dark:drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)]"
            priority
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-5 flex-wrap justify-center">
          <button
            onClick={() => router.push('/meeting')}
            className="group relative overflow-hidden h-[52px] px-9 rounded-full border-2 border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium text-base transition-all hover:scale-105 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-400 active:scale-95 cursor-pointer"
          >
            Meeting Transcription
          </button>

          <button
            onClick={() => router.push('/tracker')}
            className="group relative overflow-hidden h-[52px] px-9 rounded-full border-2 border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium text-base transition-all hover:scale-105 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-400 active:scale-95 cursor-pointer"
          >
            Work Tracker
          </button>
        </div>
      </main>
    </div>
  );
}
