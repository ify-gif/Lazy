"use client";

import { useState, useEffect } from 'react';
import { UpdateEvent } from '../../main/types';
import Button from './Button';

export default function UpdatePill() {
    const [version, setVersion] = useState<string>('v0.0.0');
    const [status, setStatus] = useState<'checking' | 'ready' | 'update-available' | 'downloading' | 'error'>('checking');
    const [progress, setProgress] = useState<number>(0);
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [showVersion, setShowVersion] = useState(true);

    useEffect(() => {
        // Toggle text every 3 seconds
        const interval = setInterval(() => {
            setShowVersion(prev => !prev);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        // Get initial version
        if (window.electron?.settings) {
            window.electron.settings.getVersion().then((v: string) => {
                setVersion(`v${v}`);
            });
        }

        // Force "Ready" state after 5 seconds if still checking (common for dev/network delay)
        const checkTimeout = setTimeout(() => {
            setStatus(prev => prev === 'checking' ? 'ready' : prev);
        }, 5000);

        // Listen for update events
        if (window.electron?.updates) {
            const unsubscribe = window.electron.updates.onUpdateEvent((data: UpdateEvent) => {
                console.log('Update Event:', data);
                switch (data.event) {
                    case 'update-available':
                        setStatus('update-available');
                        setUpdateInfo(data.data);
                        break;
                    case 'update-not-available':
                        setStatus('ready');
                        break;
                    case 'download-progress':
                        setStatus('downloading');
                        if (typeof data.data === 'number') {
                            setProgress(data.data);
                        }
                        break;
                    case 'update-downloaded':
                        setStatus('ready');
                        // We'll use this to trigger install click
                        break;
                    case 'error':
                        // In dev, errors are common. If checking failed, just say ready.
                        setStatus('ready');
                        break;
                }
            });

            return () => {
                unsubscribe();
                clearTimeout(checkTimeout);
            };
        }
    }, []);

    const handleClick = async () => {
        if (!window.electron?.updates) return;

        if (status === 'update-available') {
            await window.electron.updates.download();
        } else if (status === 'ready' && updateInfo) {
            window.electron.updates.install();
        } else {
            // Manual check
            setStatus('checking');
            await window.electron.updates.check();
            // Reset timeout for manual check
            setTimeout(() => {
                setStatus(prev => prev === 'checking' ? 'ready' : prev);
            }, 5000);
        }
    };

    const getStatusStyles = () => {
        switch (status) {
            case 'checking':
                return 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 animate-pulse';
            case 'update-available':
                return 'border-red-500/50 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 animate-breathe-red';
            case 'downloading':
                return 'border-indigo-500/50 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400';
            case 'ready':
                return updateInfo
                    ? 'border-purple-500/50 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 animate-breathe-purple'
                    : 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 animate-breathe-green';
            case 'error':
                return 'border-amber-500/50 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400';
            default:
                return 'border-zinc-300 dark:border-zinc-700 text-zinc-500';
        }
    };

    const getLabel = () => {
        if (status === 'downloading') return `${progress}%`;
        if (status === 'ready' && updateInfo) return showVersion ? version : 'Install Now';
        if (status === 'ready') return showVersion ? version : 'Up to Date';
        if (status === 'update-available') return showVersion ? version : 'New Update';
        if (status === 'checking') return 'Checking...';
        return version;
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleClick}
            className={`
                flex items-center gap-2 px-3 py-1 rounded-full border-2 text-[10px] font-bold tracking-wider uppercase transition-all duration-500 shadow-sm
                ${getStatusStyles()}
            `}
            title={status === 'update-available' ? "Update Available - Click to Download" : "System Status"}
        >
            {status === 'downloading' && (
                <div className="h-1 w-8 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden mr-1">
                    <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
            )}

            <span>{getLabel()}</span>

            <style jsx global>{`
                @keyframes breathe-green {
                    0%, 100% { box-shadow: 0 0 0px rgba(16, 185, 129, 0); }
                    50% { box-shadow: 0 0 12px rgba(16, 185, 129, 0.4); }
                }
                @keyframes breathe-red {
                    0%, 100% { box-shadow: 0 0 0px rgba(239, 68, 68, 0); }
                    50% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.4); }
                }
                @keyframes breathe-purple {
                    0%, 100% { box-shadow: 0 0 0px rgba(168, 85, 247, 0); }
                    50% { box-shadow: 0 0 12px rgba(168, 85, 247, 0.4); }
                }
                .animate-breathe-green { animation: breathe-green 3s ease-in-out infinite; }
                .animate-breathe-red { animation: breathe-red 2s ease-in-out infinite; }
                .animate-breathe-purple { animation: breathe-purple 2s ease-in-out infinite; }
                .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
            `}</style>
        </Button>
    );
}
