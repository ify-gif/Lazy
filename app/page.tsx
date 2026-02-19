"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SettingsModal from "./components/SettingsModal";
import UpdatePill from "./components/UpdatePill";
import WelcomeGuide from "./components/WelcomeGuide";
import Button from "./components/Button";

export default function Home() {
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [guideRefreshToken, setGuideRefreshToken] = useState(0);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-background overflow-y-auto overflow-x-hidden p-0">
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onApiKeyValidated={() => setGuideRefreshToken((v) => v + 1)}
      />

      {/* Startup Guide for New Users - Floating top-right */}
      <WelcomeGuide
        onOpenSettings={() => setShowSettings(true)}
        refreshToken={guideRefreshToken}
      />

      {/* Header Actions - Just Settings */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-2">
        <button
          className="translate-y-[18px] flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          onClick={() => setShowSettings(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.35a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
      </div>

      {/* Floating Update Pill - Bottom Right */}
      <div className="absolute bottom-6 right-6 z-50">
        <UpdatePill />
      </div>

      <main className="flex flex-col items-center w-full gap-2 sm:gap-4">
        {/* Hero Image - Maximum Scale, No internal padding */}
        <div className="w-full max-w-[1200px] relative max-h-[75vh] flex items-center justify-center overflow-hidden">
          <Image
            src="./logo.png"
            alt="LaZy Logo"
            width={1200}
            height={480}
            className="w-full h-auto max-h-full object-contain drop-shadow-sm dark:filter dark:grayscale dark:brightness-0 dark:invert-[1] dark:drop-shadow-[0_4px_32px_rgba(0,0,0,0.4)]"
            priority
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-4 flex-wrap justify-center px-4">
          <Button
            size="lg"
            className="min-w-[200px]"
            onClick={() => router.push('/meeting')}
          >
            Meeting Transcription
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="min-w-[200px]"
            onClick={() => router.push('/tracker')}
          >
            Work Tracker
          </Button>
        </div>
      </main>
    </div>
  );
}
