import { X, Globe, Key, Mic as MicIcon, Moon, Sun, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useTheme } from "next-themes";
import { UpdateEvent } from "../../main/types";
import Button from "./Button";
import Input from "./Input";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApiKeyValidated?: () => void;
}

type AudioContextCtor = typeof AudioContext;
type ExtendedWindow = Window & { webkitAudioContext?: AudioContextCtor };
type UpdateCheckResult = { updateInfo?: unknown } | null;

export default function SettingsModal({ isOpen, onClose, onApiKeyValidated }: SettingsModalProps) {
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

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const maxVolumeRef = useRef(0);

    function stopAudioOnly() {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        if (audioContextRef.current) audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;
        streamRef.current = null;
    }

    async function getMicrophones() {
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
    }

    useEffect(() => {
        if (isOpen) {
            getMicrophones();

            // Load Secure API Key
            if (window.electron?.settings) {
                window.electron.settings.getApiKey().then((v: string) => setApiKey(v));
                window.electron.settings.get("selectedMic").then((v: string) => {
                    if (v) setSelectedMic(v);
                });
            } else {
                const savedMic = localStorage.getItem("selectedMic");
                if (savedMic) setSelectedMic(savedMic);
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setTestStatus('idle');
            setVolume(0);
            stopAudioOnly();
        }
    }, [isOpen]);

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

            const AudioContextImpl = window.AudioContext || (window as ExtendedWindow).webkitAudioContext;
            if (!AudioContextImpl) {
                throw new Error("AudioContext is not available");
            }
            const audioContext = new AudioContextImpl();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
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

    const handleSave = () => {
        if (window.electron?.settings) {
            window.electron.settings.setApiKey(apiKey);
            window.electron.settings.set("selectedMic", selectedMic);
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
            const isValid = await window.electron?.settings?.validateApiKey(apiKey);
            setKeyStatus(isValid ? 'valid' : 'invalid');
            if (isValid) {
                // Auto-save on valid
                window.electron?.settings?.setApiKey(apiKey);
                window.electron?.settings?.sendStatus('ready', 'Ready');
                onApiKeyValidated?.();
            } else {
                window.electron?.settings?.sendStatus('error', 'Invalid Key');
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
            const result = await window.electron.updates.check() as UpdateCheckResult;
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
            await window.electron.updates.download();
        } catch (err) {
            setUpdateStatus("Download failed.");
            setIsDownloading(false);
            console.error(err);
        }
    };

    useEffect(() => {
        if (!isOpen || !window.electron?.updates) return;

        const unsubscribe = window.electron.updates.onUpdateEvent((data: UpdateEvent) => {
            switch (data.event) {
                case 'update-available':
                    const updateInfo = data.data as { version?: string } | undefined;
                    if (updateInfo?.version) {
                        setUpdateStatus(`Version ${updateInfo.version} available.`);
                    } else {
                        setUpdateStatus("New version available.");
                    }
                    setIsUpdateAvailable(true);
                    setCheckStatus('available');
                    break;
                case 'update-not-available':
                    setUpdateStatus("You are on the latest version.");
                    setIsUpdateAvailable(false);
                    setCheckStatus('idle');
                    break;
                case 'download-progress':
                    if (typeof data.data === 'number') {
                        setUpdateStatus(`Downloading: ${Math.floor(data.data)}%`);
                    }
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


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[500px] bg-card border border-border rounded-lg shadow-xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden">

                {/* Header - Centered */}
                <div className="relative flex items-center justify-center px-6 py-4 border-b border-border bg-muted/30">
                    <h2 className="text-lg font-bold text-foreground tracking-tight">Settings</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="absolute right-4 h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                        <X size={18} />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto overflow-x-hidden max-h-[80vh]">

                    {/* API Keys */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            <Key size={14} /> AI Configuration
                        </div>
                        <div className="flex gap-2">
                            <Input
                                type="password"
                                placeholder="Enter OpenAI API Key (sk-...)"
                                value={apiKey}
                                onChange={(e) => { setApiKey(e.target.value); setKeyStatus('idle'); }}
                                className="flex-1"
                            />
                            <Button
                                onClick={validateKey}
                                disabled={keyStatus === 'validating' || !apiKey}
                                variant={keyStatus === 'valid' ? 'success' : keyStatus === 'invalid' ? 'destructive' : 'primary'}
                                className="min-w-[100px] h-10"
                                isLoading={keyStatus === 'validating'}
                            >
                                {keyStatus === 'valid' ? "Valid" :
                                    keyStatus === 'invalid' ? "Invalid" : "Validate"}
                            </Button>
                        </div>
                    </div>

                    {/* Audio Device */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            <MicIcon size={14} /> Audio Input
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={selectedMic}
                                onChange={(e) => setSelectedMic(e.target.value)}
                                className="flex-1 h-10 px-3 bg-secondary border border-border rounded-md focus:ring-2 focus:ring-primary outline-none text-sm text-foreground appearance-none cursor-pointer max-w-[calc(100%-110px)]"
                            >
                                {mics.map(mic => (
                                    <option key={mic.deviceId} value={mic.deviceId} className="truncate">
                                        {mic.label || `Microphone ${mic.deviceId.slice(0, 5)}...`}
                                    </option>
                                ))}
                                {mics.length === 0 && <option>No microphones found</option>}
                            </select>
                            <Button
                                onClick={runQuickTest}
                                disabled={testStatus !== 'idle' || mics.length === 0 || !selectedMic}
                                variant={testStatus === 'pass' ? 'success' : testStatus === 'fail' ? 'destructive' : 'primary'}
                                className="min-w-[100px] h-10"
                                isLoading={testStatus === 'running'}
                            >
                                {testStatus === 'pass' ? "Pass!" :
                                    testStatus === 'fail' ? "Failed" : "Quick Test"}
                            </Button>
                        </div>

                        {/* Audio Test Feedack */}
                        {testStatus !== 'idle' && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                                    <span className={
                                        testStatus === 'pass' ? "text-green-600 dark:text-green-400" :
                                            testStatus === 'fail' ? "text-destructive" :
                                                "text-primary"
                                    }>
                                        {testStatus === 'running' ? "Calibrating..." :
                                            testStatus === 'pass' ? "Connection Stable" :
                                                "No Audio Detected"}
                                    </span>
                                    {testStatus === 'running' && <span className="text-muted-foreground font-mono">{Math.round(volume)}%</span>}
                                </div>

                                {testStatus === 'running' && (
                                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden shadow-inner">
                                        <div
                                            className="h-full bg-primary transition-all duration-75 ease-out rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]"
                                            style={{ width: `${volume}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Theme */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            <Smartphone size={14} /> Appearance
                        </div>
                        <div className="flex gap-3">
                            <Button
                                variant={theme === "light" ? "primary" : "outline"}
                                onClick={() => setTheme("light")}
                                className="flex-1"
                            >
                                <Sun size={14} className="mr-2" /> Light
                            </Button>
                            <Button
                                variant={theme === "dark" ? "primary" : "outline"}
                                onClick={() => setTheme("dark")}
                                className="flex-1"
                            >
                                <Moon size={14} className="mr-2" /> Dark
                            </Button>
                        </div>
                    </div>

                    {/* Updates */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            <Globe size={14} /> System
                        </div>
                        <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-lg">
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-xs font-bold text-foreground truncate">{updateStatus}</span>
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Public Channel</span>
                            </div>
                            {isUpdateAvailable || checkStatus === 'available' ? (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={updateStatus.includes("ready") ? () => window.electron.updates.install() : handleDownloadUpdate}
                                    disabled={isDownloading}
                                    className="px-4 py-1 animate-pulse"
                                >
                                    <RefreshCw size={12} className={`mr-1.5 ${isDownloading ? 'animate-spin' : ''}`} />
                                    {isDownloading ? "Downloading..." : updateStatus.includes("ready") ? "Restart Now" : "Download"}
                                </Button>
                            ) : (
                                <Button
                                    variant={checkStatus === 'uptodate' ? 'success' : checkStatus === 'error' ? 'destructive' : 'outline'}
                                    size="sm"
                                    onClick={checkUpdates}
                                    className="min-w-[120px]"
                                    isLoading={checkStatus === 'checking'}
                                >
                                    {checkStatus === 'uptodate' ? "Up to date" :
                                        checkStatus === 'error' ? "Try Again" : "Check Now"}
                                </Button>
                            )}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 bg-muted/40 border-t border-border flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose} className="px-6">Cancel</Button>
                    <Button onClick={handleSave} className="px-8 shadow-md">Save Changes</Button>
                </div>

            </div>
        </div>
    );
}
