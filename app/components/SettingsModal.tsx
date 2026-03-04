import { X, Globe, Key, Mic as MicIcon, Moon, Sun, RefreshCw, Smartphone, Users, Plus, Trash2, Wifi, Link, Info } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useTheme } from "next-themes";
import { LanPeer, LocalTeamProfile, TeamDevice, TeamDiagnostics, TeamTrustMode, TeamShareEvent, UpdateEvent } from "../../main/types";
import Button from "./Button";
import Input from "./Input";
import { generatePairingCode } from "../lib/lazyshare";

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
    const [isUpdateDownloaded, setIsUpdateDownloaded] = useState(false);
    const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'uptodate' | 'error' | 'available'>('idle');
    const [teamDevices, setTeamDevices] = useState<TeamDevice[]>([]);
    const [newDeviceName, setNewDeviceName] = useState("");
    const [newPairingCode, setNewPairingCode] = useState(generatePairingCode());
    const [localProfile, setLocalProfile] = useState<LocalTeamProfile | null>(null);
    const [localDeviceNameEdit, setLocalDeviceNameEdit] = useState("");
    const [discoveredPeers, setDiscoveredPeers] = useState<LanPeer[]>([]);
    const [pairStatus, setPairStatus] = useState("");
    const [isScanningPeers, setIsScanningPeers] = useState(false);
    const [teamDiagnostics, setTeamDiagnostics] = useState<TeamDiagnostics | null>(null);
    const [pairStatusTone, setPairStatusTone] = useState<'neutral' | 'success' | 'error'>('neutral');
    const [isLanInfoOpen, setIsLanInfoOpen] = useState(false);

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
                void loadTeamDevices();
                void loadLocalProfile();
                void loadDiscoveredPeers();
                void loadDiagnostics();
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

    const loadTeamDevices = async () => {
        if (!window.electron?.db) return;
        try {
            const devices = await window.electron.db.getTeamDevices();
            setTeamDevices(devices);
        } catch (err) {
            console.error("Failed to load team devices", err);
        }
    };

    const loadLocalProfile = async () => {
        if (!window.electron?.team) return;
        try {
            const profile = await window.electron.team.getLocalProfile();
            setLocalProfile(profile);
            setLocalDeviceNameEdit(profile.deviceName);
        } catch (err) {
            console.error("Failed to load local team profile", err);
        }
    };

    const loadDiscoveredPeers = async () => {
        if (!window.electron?.team) return;
        try {
            const peers = await window.electron.team.getPeers();
            setDiscoveredPeers(peers);
        } catch (err) {
            console.error("Failed to load discovered peers", err);
        }
    };

    const loadDiagnostics = async () => {
        if (!window.electron?.team) return;
        try {
            const teamApi = window.electron.team as typeof window.electron.team & {
                getDiagnostics?: () => Promise<TeamDiagnostics>;
            };
            if (!teamApi.getDiagnostics) {
                setTeamDiagnostics(null);
                return;
            }
            const diagnostics = await teamApi.getDiagnostics();
            setTeamDiagnostics(diagnostics);
        } catch (err) {
            console.error("Failed to load team diagnostics", err);
        }
    };

    const handleScanPeers = async () => {
        if (!window.electron?.team) return;
        try {
            setIsScanningPeers(true);
            setPairStatus("Scanning LAN devices...");
            setPairStatusTone('neutral');
            const teamApi = window.electron.team as typeof window.electron.team & {
                scanPeers?: () => Promise<LanPeer[]>;
            };
            const peers = teamApi.scanPeers
                ? await teamApi.scanPeers()
                : await window.electron.team.getPeers();
            setDiscoveredPeers(peers);
            if (!teamApi.scanPeers) {
                setPairStatus("Scan API unavailable in this running build. Restart/update app, then scan again.");
                setPairStatusTone('error');
                await loadDiagnostics();
                return;
            }
            setPairStatus(peers.length > 0 ? `Found ${peers.length} device(s).` : "No peers discovered yet.");
            setPairStatusTone(peers.length > 0 ? 'success' : 'neutral');
            await loadDiagnostics();
        } catch (err) {
            console.error("Failed to scan peers", err);
            setPairStatus("Scan failed.");
            setPairStatusTone('error');
        } finally {
            setIsScanningPeers(false);
        }
    };

    const handleAddTeamDevice = async () => {
        if (!window.electron?.db) return;
        const trimmed = newDeviceName.trim();
        if (!trimmed) return;
        try {
            await window.electron.db.saveTeamDevice(trimmed, newPairingCode);
            setNewDeviceName("");
            setNewPairingCode(generatePairingCode());
            await loadTeamDevices();
        } catch (err) {
            console.error("Failed to save team device", err);
        }
    };

    const handlePairDiscoveredPeer = async (peer: LanPeer) => {
        if (!window.electron?.db) return;
        if (teamDevices.some((device) => device.pairing_code === peer.pairingCode)) {
            setPairStatus(`${peer.deviceName} is already in My Team.`);
            setPairStatusTone('neutral');
            return;
        }

        try {
            await window.electron.db.saveTeamDevice(peer.deviceName, peer.pairingCode);
            await loadTeamDevices();
            setPairStatus(`Paired ${peer.deviceName}.`);
            setPairStatusTone('success');
        } catch (err) {
            console.error("Failed to pair discovered peer", err);
            setPairStatus(`Failed to pair ${peer.deviceName}.`);
            setPairStatusTone('error');
        }
    };

    const handleDeleteTeamDevice = async (deviceId: string) => {
        if (!window.electron?.db) return;
        try {
            await window.electron.db.deleteTeamDevice(deviceId);
            await loadTeamDevices();
        } catch (err) {
            console.error("Failed to delete team device", err);
        }
    };

    const handleTrustModeChange = async (deviceId: string, trustMode: TeamTrustMode) => {
        if (!window.electron?.db) return;
        try {
            await window.electron.db.updateTeamDeviceTrustMode(deviceId, trustMode);
            await loadTeamDevices();
        } catch (err) {
            console.error("Failed to update trust mode", err);
        }
    };

    const saveLocalDeviceName = async () => {
        if (!window.electron?.team) return;
        try {
            const profile = await window.electron.team.setLocalDeviceName(localDeviceNameEdit);
            setLocalProfile(profile);
            setLocalDeviceNameEdit(profile.deviceName);
        } catch (err) {
            console.error("Failed to save local device name", err);
        }
    };

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
        setIsUpdateDownloaded(false);
        try {
            const result = await window.electron.updates.check() as UpdateCheckResult;
            if (!result || !result.updateInfo) {
                setUpdateStatus("You are on the latest version.");
                setIsUpdateAvailable(false);
                setIsUpdateDownloaded(false);
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
        setIsUpdateDownloaded(false);
        setUpdateStatus("Downloading...");
        try {
            await window.electron.updates.download();
        } catch (err) {
            setUpdateStatus("Download failed.");
            setIsDownloading(false);
            setIsUpdateDownloaded(false);
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
                    setIsUpdateDownloaded(false);
                    setCheckStatus('available');
                    break;
                case 'update-not-available':
                    setUpdateStatus("You are on the latest version.");
                    setIsUpdateAvailable(false);
                    setIsUpdateDownloaded(false);
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
                    setIsUpdateDownloaded(true);
                    break;
                case 'error':
                    setUpdateStatus("Update problem. Please try again.");
                    setIsDownloading(false);
                    setIsUpdateDownloaded(false);
                    break;
            }
        });

        return () => unsubscribe();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !window.electron?.team) return;
        const unsubscribe = window.electron.team.onEvent((event: TeamShareEvent) => {
            if (event.event === 'peers-updated') {
                void loadDiscoveredPeers();
                void loadDiagnostics();
            }
        });
        return () => unsubscribe();
    }, [isOpen]);


    if (!isOpen) return null;

    return (
        <>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[620px] max-w-[94vw] bg-card border border-border rounded-lg shadow-xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden">

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
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        window.dispatchEvent(new CustomEvent('show-release-notes'));
                                        onClose();
                                    }}
                                    className="px-3"
                                >
                                    Release Notes
                                </Button>
                                {isUpdateAvailable || checkStatus === 'available' ? (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={isUpdateDownloaded ? () => window.electron.updates.install() : handleDownloadUpdate}
                                        disabled={isDownloading}
                                        className="px-4 py-1 animate-pulse"
                                    >
                                        <RefreshCw size={12} className={`mr-1.5 ${isDownloading ? 'animate-spin' : ''}`} />
                                        {isDownloading ? "Downloading..." : isUpdateDownloaded ? "Restart Now" : "Download"}
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

                    {/* My Team */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            <Users size={14} /> My Team
                        </div>
                        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                            {localProfile && (
                                <div className="rounded border border-border bg-background/80 p-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">This Device</p>
                                    <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                                        <Input
                                            value={localDeviceNameEdit}
                                            onChange={(e) => setLocalDeviceNameEdit(e.target.value)}
                                        />
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={saveLocalDeviceName}
                                            className="h-10 min-w-[88px] font-semibold"
                                        >
                                            Save
                                        </Button>
                                    </div>
                                    <p className="mt-1 text-[10px] font-mono text-muted-foreground">
                                        Code {localProfile.pairingCode} | {localProfile.fingerprint}
                                    </p>
                                </div>
                            )}

                            <div className="rounded border border-border bg-background/80 p-2">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Scan LAN Devices</p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-muted-foreground"
                                        onClick={() => void handleScanPeers()}
                                        disabled={isScanningPeers}
                                    >
                                        <Wifi size={12} className="mr-1" /> {isScanningPeers ? "Scanning..." : "Scan"}
                                    </Button>
                                </div>
                                <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                                    {discoveredPeers.length === 0 ? (
                                        <p className="text-[11px] italic text-muted-foreground">No peers discovered yet.</p>
                                    ) : discoveredPeers.map((peer) => (
                                        <div key={peer.deviceId} className="flex items-center justify-between gap-2 rounded border border-border bg-muted/30 px-2 py-1.5">
                                            <div className="min-w-0">
                                                <p className="truncate text-[11px] font-bold text-foreground">{peer.deviceName}</p>
                                                <p className="text-[10px] font-mono text-muted-foreground">{peer.fingerprint} | Code {peer.pairingCode}</p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-6 px-2 text-[10px]"
                                                onClick={() => void handlePairDiscoveredPeer(peer)}
                                            >
                                                <Link size={11} className="mr-1" /> Pair
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                {pairStatus && (
                                    <p className={`mt-1 text-[10px] ${pairStatusTone === 'success'
                                        ? 'text-green-600 dark:text-green-400'
                                        : pairStatusTone === 'error'
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-muted-foreground'
                                        }`}>{pairStatus}</p>
                                )}
                            </div>

                            <div className="rounded border border-border bg-background/80 p-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">LAN Diagnostics</p>
                                        <button
                                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary cursor-pointer"
                                            title="LAN sharing help"
                                            onClick={() => setIsLanInfoOpen(true)}
                                        >
                                            <Info size={12} />
                                        </button>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => void loadDiagnostics()}>
                                        <RefreshCw size={12} className="mr-1" /> Refresh
                                    </Button>
                                </div>
                                {!teamDiagnostics ? (
                                    <p className="mt-2 text-[11px] italic text-muted-foreground">Diagnostics unavailable.</p>
                                ) : (
                                    <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] font-mono text-muted-foreground">
                                        <span>UDP bound:</span><span>{teamDiagnostics.discoveryBound ? "yes" : "no"}</span>
                                        <span>UDP port:</span><span>{teamDiagnostics.discoveryPort}</span>
                                        <span>UDP error:</span><span className={teamDiagnostics.discoveryError ? "text-red-600 dark:text-red-400" : ""}>{teamDiagnostics.discoveryError || "-"}</span>
                                        <span>Broadcast paths:</span><span>{teamDiagnostics.broadcastTargets?.length ?? 0}</span>
                                        <span>TCP listening:</span><span>{teamDiagnostics.tcpListening ? "yes" : "no"}</span>
                                        <span>TCP port:</span><span>{teamDiagnostics.tcpPort || "-"}</span>
                                        <span>Peers seen:</span><span>{teamDiagnostics.peerCount}</span>
                                        <span>Profile ready:</span><span>{teamDiagnostics.profileReady ? "yes" : "no"}</span>
                                        <span>Last broadcast:</span>
                                        <span>{teamDiagnostics.lastBroadcastAt ? new Date(teamDiagnostics.lastBroadcastAt).toLocaleTimeString() : "-"}</span>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                                <Input
                                    placeholder="Device name (e.g. Sarah-Laptop)"
                                    value={newDeviceName}
                                    onChange={(e) => setNewDeviceName(e.target.value)}
                                />
                                <Input
                                    value={newPairingCode}
                                    onChange={(e) => setNewPairingCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    className="w-24 text-center font-mono"
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="px-2"
                                    onClick={() => setNewPairingCode(generatePairingCode())}
                                    title="Regenerate pairing code"
                                >
                                    <RefreshCw size={12} />
                                </Button>
                            </div>
                            <Button
                                variant="primary"
                                onClick={handleAddTeamDevice}
                                disabled={!newDeviceName.trim() || newPairingCode.length !== 6}
                                className="w-full"
                                size="sm"
                            >
                                <Plus size={12} className="mr-1" /> Save Team Device
                            </Button>
                            <div className="max-h-44 space-y-2 overflow-y-auto">
                                {teamDevices.length === 0 ? (
                                    <p className="text-[11px] italic text-muted-foreground">No paired devices yet.</p>
                                ) : teamDevices.map((device) => (
                                    <div key={device.device_id} className="rounded border border-border bg-background/80 p-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-bold text-foreground">{device.device_name}</p>
                                                <p className="text-[10px] font-mono text-muted-foreground">
                                                    {device.fingerprint} | Code {device.pairing_code}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                                onClick={() => void handleDeleteTeamDevice(device.device_id)}
                                                title="Remove device"
                                            >
                                                <Trash2 size={12} />
                                            </Button>
                                        </div>
                                        <div className="mt-2">
                                            <select
                                                value={device.trust_mode}
                                                onChange={(e) => void handleTrustModeChange(device.device_id, e.target.value as TeamTrustMode)}
                                                className="h-7 w-full rounded border border-border bg-background px-2 text-[11px] text-foreground"
                                            >
                                                <option value="trusted">Trusted (Auto-accept)</option>
                                                <option value="ask">Ask Every Time</option>
                                                <option value="blocked">Blocked</option>
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 bg-muted/40 border-t border-border flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} className="px-6">Cancel</Button>
                    <Button variant="secondary" onClick={handleSave} className="px-8">Save Changes</Button>
                </div>

            </div>
        </div>
        {isLanInfoOpen && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40">
                <div className="w-[360px] max-w-[92vw] rounded-lg border border-border bg-card shadow-xl">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <h3 className="text-sm font-bold text-foreground">LAN Sharing Help</h3>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsLanInfoOpen(false)}>
                            <X size={16} />
                        </Button>
                    </div>
                    <div className="space-y-2 px-4 py-3 text-xs text-muted-foreground">
                        <p>Make sure both devices are on the same local network and LAZY is open on both.</p>
                        <p>Allow LAZY through your firewall on private networks so device discovery can work.</p>
                        <p>If no devices appear, click Scan again and restart both apps before retrying.</p>
                    </div>
                    <div className="flex justify-end border-t border-border px-4 py-2">
                        <Button variant="secondary" size="sm" onClick={() => setIsLanInfoOpen(false)}>Close</Button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
