"use client";

import { Minus, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppStatus, StatusUpdate } from "../../main/types";

export default function TitleBar() {
    const router = useRouter();
    const [isMaximized, setIsMaximized] = useState(false);
    const [status, setStatus] = useState<AppStatus>('ready');
    const [statusMessage, setStatusMessage] = useState("Ready");
    const clearTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isMac = typeof window !== "undefined" && window.electron?.platform === 'darwin';

    useEffect(() => {
        const clearPendingTimer = () => {
            if (clearTimerRef.current) {
                clearTimeout(clearTimerRef.current);
                clearTimerRef.current = null;
            }
        };

        const scheduleAutoClear = (nextStatus: AppStatus, message: string) => {
            clearPendingTimer();

            const normalized = message.trim().toUpperCase();
            let timeoutMs = 0;

            if (nextStatus === 'warning') {
                timeoutMs = normalized.includes('SILENCE') ? 3500 : 5000;
            } else if (nextStatus === 'ready') {
                timeoutMs = normalized === 'READY' ? 0 : 3000;
            } else if (nextStatus === 'error') {
                timeoutMs = normalized.includes('NO API KEY') ? 12000 : 7000;
            }

            if (timeoutMs > 0) {
                clearTimerRef.current = setTimeout(() => {
                    setStatus('ready');
                    setStatusMessage('Ready');
                    clearTimerRef.current = null;
                }, timeoutMs);
            }
        };

        void window.electron.settings.getApiKey().then((key) => {
            if (!key) {
                setStatus('error');
                setStatusMessage('NO API KEY');
                return;
            }
            setStatus('ready');
            setStatusMessage('Ready');
        });

        const unsubscribe = window.electron.settings.onStatusChange((data: StatusUpdate) => {
            setStatus(data.status);
            const message = data.message || (data.status === 'ready' ? 'Ready' : '');
            setStatusMessage(message);
            if (message) {
                scheduleAutoClear(data.status, message);
            }
        });

        return () => {
            clearPendingTimer();
            unsubscribe?.();
        };
    }, []);

    const handleMinimize = () => {
        window.electron?.windowControls?.minimize();
    };

    const handleMaximize = () => {
        window.electron?.windowControls?.maximize();
        setIsMaximized(!isMaximized);
    };

    const handleClose = () => {
        window.electron?.windowControls?.close();
    };

    // Status Colors
    const getStatusColor = () => {
        switch (status) {
            case 'recording': return 'bg-blue-500 animate-pulse';
            case 'processing': return 'bg-purple-500 animate-bounce';
            case 'warning': return 'bg-amber-500';
            case 'error': return 'bg-red-500';
            case 'ready': return 'bg-green-500';
            default: return 'bg-zinc-400';
        }
    };

    // Status Text
    // Status Text
    const getStatusText = () => {
        switch (status) {
            case 'recording': return 'Recording...';
            case 'processing': return statusMessage || 'Processing...';
            case 'warning': return statusMessage || 'Attention';
            case 'error': return statusMessage || 'System Error';
            case 'ready': return statusMessage || 'Ready';
            default: return 'Initializing...';
        }
    };

    const controls = (
        <div className={`flex bg-transparent app-region-no-drag ${isMac ? 'pl-2' : ''}`}>
            <button
                onClick={handleMinimize}
                className="h-8 w-10 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
                title="Minimize"
            >
                <Minus size={16} />
            </button>
            <button
                onClick={handleMaximize}
                className="h-8 w-10 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
                title="Maximize"
            >
                <Square size={14} />
            </button>
            <button
                onClick={handleClose}
                className="h-8 w-10 flex items-center justify-center hover:bg-red-500 hover:text-white text-zinc-500 dark:text-zinc-400 transition-colors"
                title="Close"
            >
                <X size={16} />
            </button>
        </div>
    );

    const brand = (
        <div className={`flex items-center gap-4 px-3 app-region-no-drag ${isMac ? 'flex-row-reverse' : ''}`}>
            {/* Brand / Home Link */}
            <div
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => router.push('/')}
                title="Go Home"
            >
                <img
                    src="/app_icon.png"
                    alt="App Logo"
                    className="w-4 h-4 object-contain dark:filter dark:grayscale dark:brightness-0 dark:invert-[1]"
                />
                <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300 tracking-tight">LAZY</span>
            </div>

            {/* Divider */}
            <div className="h-3 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

            {/* Status Indicator (Pill) */}
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor()} shadow-sm`} />
                <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500 dark:text-zinc-400">
                    {getStatusText()}
                </span>
            </div>
        </div>
    );

    return (
        <div className="h-8 bg-white dark:bg-zinc-900 border-b border-zinc-300 dark:border-zinc-800 flex items-center justify-between select-none app-region-drag">
            {isMac ? (
                <>
                    {controls}
                    {brand}
                </>
            ) : (
                <>
                    {brand}
                    {controls}
                </>
            )}
        </div>
    );
}
