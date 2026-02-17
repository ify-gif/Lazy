"use client";

import { X } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useTheme } from "next-themes";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { theme, setTheme } = useTheme();
    const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
    const [selectedMic, setSelectedMic] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'pass' | 'fail'>('idle');
    const [volume, setVolume] = useState(0);
    const [updateStatus, setUpdateStatus] = useState<string>("Up to date");
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'uptodate' | 'error' | 'available'>('idle');

    const [mounted, setMounted] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const maxVolumeRef = useRef(0);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            getMicrophones();

            // Load Secure API Key
            if ((window as any).electron?.settings) {
                (window as any).electron.settings.getApiKey().then((v: string) => setApiKey(v));
                (window as any).electron.settings.get("selectedMic").then((v: string) => {
                    if (v) setSelectedMic(v);
                });
            } else {
                const savedMic = localStorage.getItem("selectedMic");
                if (savedMic) setSelectedMic(savedMic);
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) stopTest();
    }, [isOpen]);

    const getMicrophones = async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(d => d.kind === 'audioinput');
            setMics(audioInputs);
            if (audioInputs.length > 0 && !localStorage.getItem("selectedMic")) {
                setSelectedMic(audioInputs[0].deviceId);
            }
        } catch (err) {
            console.error("Error accessing microphones", err);
        }
    };

    const runQuickTest = async () => {
        try {
            setTestStatus('running');
            maxVolumeRef.current = 0;

            if (!selectedMic) {
                setTestStatus('fail');
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: selectedMic } }
            });
            streamRef.current = stream;

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateVolume = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                const currentVol = Math.min(100, average * 2);
                setVolume(currentVol);
                if (currentVol > maxVolumeRef.current) maxVolumeRef.current = currentVol;
                animationFrameRef.current = requestAnimationFrame(updateVolume);
            };
            updateVolume();

            // Run for 3 seconds
            setTimeout(() => {
                stopAudioOnly();
                // Pass if we saw any significant volume (> 5%)
                const result = maxVolumeRef.current > 5 ? 'pass' : 'fail';
                setTestStatus(result);

                // Reset to idle after 2 seconds
                setTimeout(() => {
                    setTestStatus('idle');
                    setVolume(0);
                }, 2000);
            }, 3000);

        } catch (err) {
            console.error("Error starting test", err);
            setTestStatus('fail');
        }
    };

    const stopAudioOnly = () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        if (audioContextRef.current) audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;
        streamRef.current = null;
    };

    const stopTest = () => {
        setTestStatus('idle');
        setVolume(0);
        stopAudioOnly();
    };

    const handleSave = () => {
        if ((window as any).electron?.settings) {
            (window as any).electron.settings.setApiKey(apiKey);
            (window as any).electron.settings.set("selectedMic", selectedMic);
        } else {
            localStorage.setItem("selectedMic", selectedMic);
        }
        onClose();
    };

    const [keyStatus, setKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

    const validateKey = async () => {
        if (!apiKey) return;
        setKeyStatus('validating');
        try {
            const isValid = await (window as any).electron?.settings?.validateApiKey(apiKey);
            setKeyStatus(isValid ? 'valid' : 'invalid');
            if (isValid) {
                // Auto-save on valid
                (window as any).electron?.settings?.setApiKey(apiKey);
                (window as any).electron?.settings?.sendStatus('ready', 'Ready');
            } else {
                (window as any).electron?.settings?.sendStatus('error', 'Invalid Key');
            }

            // Reset status after 3s
            setTimeout(() => setKeyStatus('idle'), 3000);
        } catch (err) {
            console.error("Validation failed", err);
            setKeyStatus('invalid');
        }
    };

    const checkUpdates = async () => {
        setUpdateStatus("Checking...");
        setCheckStatus('checking');
        try {
            const result = await (window as any).electron.updates.check();
            if (!result || !result.updateInfo) {
                setUpdateStatus("You are on the latest version.");
                setIsUpdateAvailable(false);
                setCheckStatus('uptodate');
                setTimeout(() => setCheckStatus('idle'), 3000);
            } else {
                setCheckStatus('available');
            }
        } catch (err) {
            setUpdateStatus("Failed to check for updates.");
            setCheckStatus('error');
            setTimeout(() => setCheckStatus('idle'), 3000);
            console.error(err);
        }
    };

    const handleDownloadUpdate = async () => {
        setIsDownloading(true);
        setUpdateStatus("Downloading...");
        try {
            await (window as any).electron.updates.download();
        } catch (err) {
            setUpdateStatus("Download failed.");
            setIsDownloading(false);
            console.error(err);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        const unsubscribe = (window as any).electron.updates.onUpdateEvent((data: { event: string, data?: any }) => {
            switch (data.event) {
                case 'update-available':
                    setUpdateStatus(`Version ${data.data.version} available.`);
                    setIsUpdateAvailable(true);
                    setCheckStatus('available');
                    break;
                case 'update-not-available':
                    setUpdateStatus("You are on the latest version.");
                    setIsUpdateAvailable(false);
                    setCheckStatus('idle');
                    break;
                case 'download-progress':
                    setUpdateStatus(`Downloading: ${Math.floor(data.data)}%`);
                    break;
                case 'update-downloaded':
                    setUpdateStatus("Update ready to install.");
                    setIsUpdateAvailable(true);
                    setIsDownloading(false);
                    break;
                case 'error':
                    setUpdateStatus("Update problem. Please try again.");
                    setIsDownloading(false);
                    break;
            }
        });

        return () => unsubscribe();
    }, [isOpen]);


    if (!isOpen || !mounted) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[500px] bg-card border border-border rounded-lg shadow-xl animate-in zoom-in-95 duration-200">

                {/* Header - Centered */}
                <div className="relative flex items-center justify-center px-6 py-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground">Settings</h2>
                    <button onClick={onClose} className="absolute right-6 text-muted-foreground hover:text-foreground transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    {/* API Keys */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-muted-foreground">OpenAI API Key</label>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                placeholder="sk-..."
                                value={apiKey}
                                onChange={(e) => { setApiKey(e.target.value); setKeyStatus('idle'); }}
                                className="flex-1 px-3 py-2 bg-secondary border border-border rounded-md focus:ring-2 focus:ring-primary outline-none text-sm text-foreground transition-all"
                            />
                            <button
                                onClick={validateKey}
                                disabled={keyStatus === 'validating' || !apiKey}
                                className={`px-4 py-2 rounded-md text-xs font-semibold shadow-sm transition-all disabled:opacity-80 min-w-[80px] ${keyStatus === 'valid' ? "bg-green-600 text-white" :
                                    keyStatus === 'invalid' ? "bg-destructive text-destructive-foreground" :
                                        "bg-primary text-primary-foreground hover:bg-primary/90"
                                    }`}
                            >
                                {keyStatus === 'validating' ? "Checking..." :
                                    keyStatus === 'valid' ? "Valid" :
                                        keyStatus === 'invalid' ? "Invalid" : "Validate"}
                            </button>
                        </div>
                    </div>

                    {/* Audio Device */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-muted-foreground">Microphone</label>
                        <div className="flex gap-2 min-w-0">
                            <select
                                value={selectedMic}
                                onChange={(e) => setSelectedMic(e.target.value)}
                                className="flex-1 min-w-0 px-3 py-2 bg-secondary border border-border rounded-md focus:ring-2 focus:ring-primary outline-none text-sm text-foreground"
                            >
                                {mics.map(mic => (
                                    <option key={mic.deviceId} value={mic.deviceId}>
                                        {mic.label || `Microphone ${mic.deviceId.slice(0, 5)}...`}
                                    </option>
                                ))}
                                {mics.length === 0 && <option>No microphones found</option>}
                            </select>
                            <button
                                onClick={runQuickTest}
                                disabled={testStatus !== 'idle' || mics.length === 0 || !selectedMic}
                                className={`px-4 py-2 rounded-md text-xs font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px] ${testStatus === 'pass'
                                    ? "bg-green-600 text-white"
                                    : testStatus === 'fail'
                                        ? "bg-destructive text-destructive-foreground"
                                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                                    }`}
                            >
                                {testStatus === 'running' ? "Testing..." :
                                    testStatus === 'pass' ? "Pass!" :
                                        testStatus === 'fail' ? "Failed" : "Quick Test"}
                            </button>
                        </div>

                        {/* Audio Test Feedack */}
                        {(testStatus !== 'idle') && (
                            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200 pt-1">
                                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                                    <span className={
                                        testStatus === 'pass' ? "text-green-600 dark:text-green-400" :
                                            testStatus === 'fail' ? "text-destructive" :
                                                "text-muted-foreground"
                                    }>
                                        {testStatus === 'running' ? "Calibrating..." :
                                            testStatus === 'pass' ? "Connection Good" :
                                                "No Audio Detected"}
                                    </span>
                                    {testStatus === 'running' && <span className="text-muted-foreground">{Math.round(volume)}%</span>}
                                </div>

                                {testStatus === 'running' && (
                                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-75 ease-out rounded-full"
                                            style={{ width: `${volume}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Theme */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-muted-foreground">Theme</label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setTheme("light")}
                                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all border ${theme === "light"
                                    ? "bg-primary border-primary text-primary-foreground shadow-sm"
                                    : "bg-secondary border-border text-muted-foreground hover:bg-muted/50"
                                    }`}
                            >
                                Light
                            </button>
                            <button
                                onClick={() => setTheme("dark")}
                                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all border ${theme === "dark"
                                    ? "bg-primary border-primary text-primary-foreground shadow-sm"
                                    : "bg-secondary border-border text-muted-foreground hover:bg-muted/50"
                                    }`}
                            >
                                Dark
                            </button>
                        </div>
                    </div>

                    {/* Updates */}
                    <div className="space-y-3 pt-2">
                        <label className="text-sm font-medium text-muted-foreground transition-colors">System Update</label>
                        <div className="flex items-center justify-between p-3 bg-secondary/50 border border-border rounded-md">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-semibold text-foreground">{updateStatus}</span>
                                <span className="text-[10px] text-muted-foreground">GitHub Public Channel</span>
                            </div>
                            {isUpdateAvailable || checkStatus === 'available' ? (
                                <button
                                    onClick={updateStatus.includes("ready") ? () => (window as any).electron.updates.install() : handleDownloadUpdate}
                                    disabled={isDownloading}
                                    className="px-4 py-1.5 bg-destructive border border-destructive hover:bg-destructive/90 text-destructive-foreground text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isDownloading ? "Downloading..." : updateStatus.includes("ready") ? "Restart Now" : "Download"}
                                </button>
                            ) : (
                                <button
                                    onClick={checkUpdates}
                                    className={`px-4 py-1.5 border border-border text-[10px] font-bold uppercase tracking-wider rounded-full transition-all active:scale-95 min-w-[100px] ${checkStatus === 'uptodate' ? "bg-green-600 border-green-600 text-white" :
                                            checkStatus === 'error' ? "bg-destructive border-destructive text-destructive-foreground" :
                                                "bg-primary hover:bg-primary/90 text-primary-foreground"
                                        }`}
                                >
                                    {checkStatus === 'checking' ? "Checking..." :
                                        checkStatus === 'uptodate' ? "Up to date" :
                                            checkStatus === 'error' ? "Try Again" : "Check Now"}
                                </button>
                            )}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 bg-muted/30 border-t border-border flex justify-end gap-3 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium shadow-sm transition-colors">Save Changes</button>
                </div>

            </div>
        </div>
    );
}
