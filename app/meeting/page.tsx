"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { History, Save, Copy, RotateCcw, Download, Wand2, Trash2 } from "lucide-react";
import Waveform from "../components/Waveform";
import Modal from "../components/Modal";

export default function MeetingPage() {
    const router = useRouter();

    const [title, setTitle] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [transcript, setTranscript] = useState("");
    const [summary, setSummary] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const [historyItems, setHistoryItems] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);

    // Modal State
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

    const loadHistory = async () => {
        if (!(window as any).electron?.db) return;
        try {
            const data = await (window as any).electron.db.getMeetings();
            setHistoryItems(data);
        } catch (err) {
            console.error("Failed to load meeting history", err);
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    const handleSelectMeeting = (item: any) => {
        setTitle(item.title);
        setTranscript(item.transcript);
        setSummary(item.summary);
        setSelectedMeetingId(item.id);
    };

    const handleDeleteClick = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setPendingDeleteId(id);
    };

    const confirmDelete = async () => {
        if (pendingDeleteId === null) return;
        try {
            await (window as any).electron.db.deleteItem('meetings', pendingDeleteId);
            if (selectedMeetingId === pendingDeleteId) {
                setSelectedMeetingId(null);
                setTitle("");
                setTranscript("");
                setSummary("");
            }
            loadHistory();
        } catch (err) {
            console.error("Delete failed", err);
        } finally {
            setPendingDeleteId(null);
        }
    };

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // VAD Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const maxVolumeRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);

    useEffect(() => {
        if (isRecording) {
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isRecording]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const startVAD = async (stream: MediaStream) => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        maxVolumeRef.current = 0;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVolume = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            if (average > maxVolumeRef.current) maxVolumeRef.current = average;
            animationFrameRef.current = requestAnimationFrame(updateVolume);
        };
        updateVolume();
    };

    const stopVAD = () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;
    };

    const handleToggleRecording = async () => {
        if (!isRecording) {
            // Prevent recording if session is not empty
            if (transcript.trim()) {
                setAlertMessage("Please clear the current session before starting a new recording.");
                return;
            }

            try {
                const electron = (window as any).electron;
                const selectedMic = await electron?.settings?.get("selectedMic");
                const constraints = {
                    audio: selectedMic ? { deviceId: { exact: selectedMic } } : true
                };

                const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
                setStream(mediaStream);

                // Start VAD
                startVAD(mediaStream);

                const options = { mimeType: 'audio/webm' };
                const recorder = new MediaRecorder(mediaStream, options);
                mediaRecorderRef.current = recorder;
                chunksRef.current = [];

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunksRef.current.push(e.data);
                };

                recorder.onstop = async () => {
                    stopVAD();
                    // Silence Check
                    if (maxVolumeRef.current < 10) {
                        console.warn("Audio too quiet, dropping.");
                        (window as any).electron?.settings?.sendStatus('ready', 'Ignored (Silence)');
                        setStream(null);
                        mediaStream.getTracks().forEach(t => t.stop());
                        return;
                    }

                    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                    const arrayBuffer = await blob.arrayBuffer();
                    processAudio(arrayBuffer);

                    // Stop all tracks
                    mediaStream.getTracks().forEach(t => t.stop());
                    setStream(null);
                };

                recorder.start(1000); // Collect 1s chunks
                setIsRecording(true);
                setRecordingTime(0);
            } catch (err) {
                console.error("Recording failed to start", err);
                (window as any).electron?.settings?.sendStatus('error', 'Recording failed');
            }
        } else {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
            (window as any).electron?.settings?.sendStatus('processing', 'Processing Audio...');
        }
    };

    const processAudio = async (arrayBuffer: ArrayBuffer) => {
        if (!(window as any).electron?.ai) return;

        setIsProcessing(true);
        (window as any).electron?.settings?.sendStatus('processing', 'Transcribing...');
        try {
            // 1. Transcribe (Whisper)
            const text = await (window as any).electron.ai.transcribe(arrayBuffer);
            setTranscript(text);

            (window as any).electron?.settings?.sendStatus('ready', 'Transcript Ready');
        } catch (err: any) {
            console.error("AI Processing failed", err);
            setTranscript("Error: " + err.message);

            const msg = err.message || 'AI Failed';
            if (msg.includes('API Key not found')) {
                (window as any).electron?.settings?.sendStatus('error', 'NO API KEY');
            } else if (msg.includes('Whisper API failed')) {
                (window as any).electron?.settings?.sendStatus('error', 'WHISPER API ERROR');
            } else {
                (window as any).electron?.settings?.sendStatus('error', 'AI FAILED');
            }
        } finally {
            setIsProcessing(false);
            // Reset to ready if not error
            (window as any).electron?.settings?.sendStatus('ready', 'Ready');
        }
    };

    const handleExportItem = (item: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item.summary) return;
        const blob = new Blob([item.summary], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(item.title || "meeting").replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden font-sans">

            {/* --- TOP BRAND BAR --- */}
            <div className="flex items-center justify-center pt-0 pb-0 -mt-2">
                <button
                    onClick={() => router.push('/')}
                    className="transition-opacity focus:outline-none cursor-pointer p-0 m-0 border-none bg-transparent"
                    title="Go Home"
                >
                    <img
                        src="./logo.png"
                        alt="LAZY Logo"
                        className="h-28 w-auto object-contain dark:filter dark:grayscale dark:brightness-0 dark:invert-[1]"
                    />
                </button>
            </div>

            {/* --- ACTIONS HEADER --- */}
            <header className="flex items-center justify-between px-8 py-0 bg-background">
                <div className="flex-1 flex items-center gap-6 min-w-0">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            placeholder="Meeting Title..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-secondary border-2 border-input rounded-md px-3 py-1.5 w-80 focus:outline-none focus:ring-1 focus:ring-ring text-sm font-medium"
                        />

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleToggleRecording}
                                className={`flex items-center justify-center px-4 py-1.5 rounded-md text-sm font-semibold shadow-sm transition-all focus:outline-none cursor-pointer active:scale-95 ${isRecording
                                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse"
                                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                                    }`}
                            >
                                {isRecording ? "Stop Recording" : "Start Recording"}
                            </button>

                            {isRecording && (
                                <div className="flex items-center gap-3 px-3 py-1.5 bg-secondary/50 rounded-md border border-border">
                                    <span className="text-sm font-mono text-foreground font-medium w-12">{formatTime(recordingTime)}</span>
                                    <Waveform stream={stream} className="w-24 h-6" />
                                </div>
                            )}

                            {isProcessing && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/30 rounded-md border border-border">
                                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                                    <span className="text-xs font-medium text-muted-foreground">AI Processing...</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>


                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md shadow-sm transition-all cursor-pointer active:scale-95 ${showHistory ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground hover:opacity-90'}`}
                        title="View History">
                        {showHistory ? 'Hide History' : 'History'}
                    </button>
                </div>
            </header>

            {/* --- CONTENT --- */}
            <main className="flex-1 flex overflow-hidden p-4 pb-8 gap-4">

                {/* HISTORY SIDEBAR */}
                {showHistory && (
                    <aside className="w-[280px] flex flex-col min-w-[280px]">
                        <div className="flex-1 border border-border p-0.5 rounded-lg bg-card/10">
                            <div className="h-full flex flex-col border border-border rounded-md bg-card overflow-hidden">
                                <div className="px-4 py-2 border-b border-border bg-muted/50">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saved Meetings</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                                    {historyItems.length === 0 ? (
                                        <div className="text-center py-10 opacity-30 italic text-sm text-muted-foreground p-4">No meetings yet</div>
                                    ) : historyItems.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => handleSelectMeeting(item)}
                                            className={`group flex items-center justify-between p-3 border-b border-border/60 cursor-pointer transition-all last:border-0 ${selectedMeetingId === item.id
                                                ? "bg-secondary border-primary/20 shadow-sm"
                                                : "hover:bg-secondary/50 border-transparent hover:border-border"
                                                }`}
                                        >
                                            <div className="flex flex-col min-w-0 mr-3">
                                                <div className="font-medium text-xs text-foreground truncate" title={item.title || "Untitled"}>
                                                    {item.title || "Untitled"}
                                                </div>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {new Date(item.created_at).toLocaleDateString()}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1 transition-opacity">
                                                <button
                                                    onClick={(e) => handleExportItem(item, e)}
                                                    className="relative z-10 flex items-center justify-center h-6 w-6 rounded-md border border-border text-muted-foreground hover:text-primary hover:bg-secondary hover:border-primary transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                                                    title={item.summary ? "Export Markdown" : "No summary to export"}
                                                    disabled={!item.summary}
                                                >
                                                    <Download size={13} className={!item.summary ? "opacity-50" : ""} />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteClick(item.id, e)}
                                                    className="relative z-10 flex items-center justify-center h-6 w-6 rounded-md border border-border text-destructive/80 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-destructive"
                                                    title="Delete Meeting"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </aside>
                )}

                {/* Left: Transcript (60%) */}
                <div className="flex-[1.5] flex flex-col min-w-0 border border-border p-0.5 rounded-lg bg-card/10">
                    <section className="h-full flex flex-col border border-border rounded-md min-w-0 bg-card overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/50">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                Transcript
                            </h2>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => { setTranscript(""); setSummary(""); setTitle(""); setRecordingTime(0); setSelectedMeetingId(null); }}
                                    className="text-xs text-primary underline hover:text-primary/80 transition-all cursor-pointer active:scale-95"
                                >
                                    Clear / New Session
                                </button>
                                <span className="text-xs text-muted-foreground font-mono">
                                    {(transcript || "").split(/\s+/).filter(w => w).length} words
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                            {transcript || (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm text-center px-8 opacity-50">
                                    <p>Your transcription will appear here as you speak.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Right: Summary (40%) */}
                <div className="flex-1 flex flex-col min-w-0 border border-border p-0.5 rounded-lg bg-card/10">
                    <section className="h-full flex flex-col bg-card border border-border rounded-md overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/50">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                OUTPUT
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    className="flex items-center gap-1.5 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-all shadow-sm disabled:opacity-50 cursor-pointer active:scale-95 disabled:cursor-not-allowed"
                                    onClick={async () => {
                                        if (!transcript) return;
                                        setIsProcessing(true);
                                        (window as any).electron?.settings?.sendStatus('processing', 'Summarizing...');
                                        try {
                                            const summaryResult = await (window as any).electron.ai.summarizeMeeting(transcript);
                                            setSummary(summaryResult);
                                            (window as any).electron?.settings?.sendStatus('ready', 'Ready');
                                        } catch (err: any) {
                                            console.error("Summary failed", err);
                                            (window as any).electron?.settings?.sendStatus('error', 'Summary Failed');
                                        } finally {
                                            setIsProcessing(false);
                                        }
                                    }}
                                    disabled={!transcript || isProcessing}
                                >
                                    Generate
                                </button>
                                <button
                                    className="p-1.5 text-xs border border-border text-primary rounded hover:bg-secondary transition-all cursor-pointer active:scale-95"
                                    onClick={async () => {
                                        if (!transcript || !summary) return;
                                        try {
                                            // Pass separate arguments as expected by preload.ts
                                            await (window as any).electron.db.saveMeeting(
                                                title || "Untitled Meeting",
                                                transcript,
                                                summary
                                            );
                                            setAlertMessage("Meeting saved successfully!");
                                            loadHistory(); // Refresh sidebar
                                        } catch (err) {
                                            console.error("Failed to save meeting", err);
                                        }
                                    }}
                                    title="Save Meeting"
                                >
                                    <Save size={14} />
                                </button>
                                <button
                                    className="p-1.5 text-xs border border-border text-primary rounded hover:bg-secondary transition-all cursor-pointer active:scale-95"
                                    onClick={() => navigator.clipboard.writeText(summary)}
                                    title="Copy to Clipboard"
                                >
                                    <Copy size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 p-5 overflow-y-auto">
                            {summary ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <div dangerouslySetInnerHTML={{ __html: summary.replace(/\n/g, '<br/>') }} />
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm text-center px-8 opacity-50">
                                    <p>AI Summary will be generated automatically after the meeting.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>


            </main>

            {/* --- MODALS --- */}
            {alertMessage && (
                <Modal
                    isOpen={!!alertMessage}
                    onClose={() => setAlertMessage(null)}
                    title="Notification"
                    footer={
                        <button
                            onClick={() => setAlertMessage(null)}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                        >
                            OK
                        </button>
                    }
                >
                    <p>{alertMessage}</p>
                </Modal>
            )}

            {pendingDeleteId !== null && (
                <Modal
                    isOpen={pendingDeleteId !== null}
                    onClose={() => setPendingDeleteId(null)}
                    title="Delete Meeting"
                    footer={
                        <>
                            <button
                                onClick={() => setPendingDeleteId(null)}
                                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors"
                            >
                                Delete
                            </button>
                        </>
                    }
                >
                    <p>Are you sure you want to permanently delete this meeting?</p>
                </Modal>
            )}
        </div>
    );
}
