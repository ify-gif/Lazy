"use client";

import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Settings } from "lucide-react";

interface WelcomeGuideProps {
    onOpenSettings: () => void;
}

export default function WelcomeGuide({ onOpenSettings }: WelcomeGuideProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const checkApiKey = async () => {
            const electron = (window as any).electron;
            if (electron?.settings) {
                const key = await electron.settings.getApiKey();
                // Show guide only if key is missing
                if (!key || key.trim() === "") {
                    setIsVisible(true);
                }
            }
        };
        checkApiKey();
    }, []);

    if (!isVisible) return null;

    return (
        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-both">
            <div className="relative overflow-hidden rounded-2xl border border-indigo-200/50 dark:border-indigo-500/20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-8 shadow-2xl dark:shadow-indigo-500/5">

                {/* Decorative background glow */}
                <div className="absolute -top-24 -right-24 h-48 w-48 bg-indigo-500/10 blur-[80px] rounded-full" />
                <div className="absolute -bottom-24 -left-24 h-48 w-48 bg-purple-500/10 blur-[80px] rounded-full" />

                <div className="relative flex flex-col md:flex-row items-center gap-8">

                    {/* Icon section */}
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
                        <Sparkles size={32} />
                    </div>

                    {/* Content section */}
                    <div className="flex-1 text-center md:text-left space-y-2">
                        <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 italic tracking-tight">
                            Ready to unlock LAZY's full potential?
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-md">
                            To use the <span className="text-indigo-600 dark:text-indigo-400 font-semibold font-mono">Strategic Consultant</span> and transcription features, you'll need to add your OpenAI API key in settings.
                        </p>
                    </div>

                    {/* Action section */}
                    <button
                        onClick={onOpenSettings}
                        className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-zinc-900 dark:bg-zinc-100 px-6 py-3 text-sm font-bold text-white dark:text-zinc-900 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-zinc-900/10 dark:shadow-none"
                    >
                        <Settings size={16} className="transition-transform group-hover:rotate-45" />
                        <span>Setup Now</span>
                        <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                    </button>
                </div>
            </div>

            {/* Subtle disclaimer */}
            <p className="mt-4 text-center text-[10px] uppercase font-bold tracking-widest text-zinc-400 dark:text-zinc-500">
                LAZY is a BYOK (Bring Your Own Key) application for maximum privacy
            </p>
        </div>
    );
}
