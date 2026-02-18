"use client";

import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function TitleBar() {
    const router = useRouter();
    const [isMaximized, setIsMaximized] = useState(false);
    const [status, setStatus] = useState<'ready' | 'recording' | 'processing' | 'error'>('ready');
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        // Initial check
        const checkStatus = async () => {
            const electron = (window as any).electron;
            if (electron?.settings) {
                const key = await electron.settings.getApiKey();
                if (!key) {
                    setStatus('error');
                    setErrorMessage('NO API KEY');
                } else {
                    setStatus('ready');
                }

                // Listen for updates
                electron.settings.onStatusChange((data: any) => {
                    setStatus(data.status);
                    if (data.message) setErrorMessage(data.message);
                });
            }
        };
        checkStatus();
    }, []);

    // ... (rest of the code)

    const handleMinimize = () => {
        // @ts-ignore
        window.electron?.windowControls?.minimize();
    };

    const handleMaximize = () => {
        // @ts-ignore
        window.electron?.windowControls?.maximize();
        setIsMaximized(!isMaximized);
    };

    const handleClose = () => {
        // @ts-ignore
        window.electron?.windowControls?.close();
    };

    // Status Colors
    const getStatusColor = () => {
        switch (status) {
            case 'recording': return 'bg-blue-500 animate-pulse';
            case 'processing': return 'bg-purple-500 animate-bounce';
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
            case 'processing': return errorMessage || 'Processing...';
            case 'error': return errorMessage || 'System Error';
            case 'ready': return errorMessage || 'Ready';
            default: return 'Initializing...';
        }
    };

    const [isMac, setIsMac] = useState(false);

    useEffect(() => {
        setIsMac((window as any).electron?.platform === 'darwin');
    }, []);

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
            {/* Status Indicator (Pill) */}
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor()} shadow-sm`} />
                <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500 dark:text-zinc-400">
                    {getStatusText()}
                </span>
            </div>

            {/* Divider */}
            <div className="h-3 w-[1px] bg-zinc-300 dark:bg-zinc-700" />

            {/* Brand / Home Link */}
            <div
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => router.push('/')}
                title="Go Home"
            >
                <img
                    src="/app_icon.png"
                    alt="App Logo"
                    className="w-4 h-4 object-contain"
                />
                <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300 tracking-tight">LAZY</span>
            </div>
        </div>
    );

    return (
        <div className="h-8 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between select-none app-region-drag">
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
