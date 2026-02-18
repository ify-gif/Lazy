"use client";

import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, X } from "lucide-react";
import Button from "./Button";

interface WelcomeGuideProps {
    onOpenSettings: () => void;
}

export default function WelcomeGuide({ onOpenSettings }: WelcomeGuideProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const checkApiKey = async () => {
            const electron = window.electron;
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

                <Button
                    size="sm"
                    onClick={onOpenSettings}
                    className="h-7 px-3 bg-primary text-primary-foreground rounded-full text-[10px] font-bold hover:opacity-90 transition-all"
                >
                    <span>Configure</span>
                    <ArrowRight size={10} className="ml-1" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDismissed(true)}
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                >
                    <X size={12} />
                </Button>
            </div>
        </div>
    );
}
