"use client";

import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, X } from "lucide-react";

interface WelcomeGuideProps {
    onOpenSettings: () => void;
}

export default function WelcomeGuide({ onOpenSettings }: WelcomeGuideProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const checkApiKey = async () => {
            const electron = (window as any).electron;
            if (electron?.settings) {
                const key = await electron.settings.getApiKey();
                if (!key || key.trim() === "") {
                    setIsVisible(true);
                }
            }
        };
        checkApiKey();
    }, []);

    if (!isVisible || dismissed) return null;

    return (
        <div className="absolute top-12 right-7 z-[60] animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex items-center gap-3 px-4 py-2 bg-card border border-border rounded-full shadow-lg backdrop-blur-md">
                <Sparkles size={14} className="text-primary" />
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-foreground/80 leading-tight">
                        Setup Required
                    </span>
                    <span className="text-[9px] text-muted-foreground font-medium leading-tight">
                        Add API Key to begin
                    </span>
                </div>

                <div className="h-4 w-[1px] bg-border mx-1" />

                <button
                    onClick={onOpenSettings}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground rounded-full text-[10px] font-bold hover:opacity-90 transition-all active:scale-95"
                >
                    <span>Configure</span>
                    <ArrowRight size={10} />
                </button>

                <button
                    onClick={() => setDismissed(true)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X size={12} />
                </button>
            </div>
        </div>
    );
}
