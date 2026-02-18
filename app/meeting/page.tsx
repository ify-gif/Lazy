import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { History, Save, Copy, Download, Trash2, Mic } from "lucide-react";
import Waveform from "../components/Waveform";
import Modal from "../components/Modal";
import Button from "../components/Button";
import Input from "../components/Input";
import ReactMarkdown from 'react-markdown';
import { Meeting } from "../../main/types";

export default function MeetingPage() {
    const router = useRouter();

    const [title, setTitle] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [transcript, setTranscript] = useState("");
    const [summary, setSummary] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const [historyItems, setHistoryItems] = useState<Meeting[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);

    // Modal State
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

    const loadHistory = async () => {
        if (!window.electron?.db) return;
        try {
            const data = await window.electron.db.getMeetings();
            setHistoryItems(data);
        } catch (err) {
            console.error("Failed to load meeting history", err);
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    const handleSelectMeeting = (item: Meeting) => {
        setTitle(item.title);
        setTranscript(item.transcript);
        setSummary(item.summary);
        setSelectedMeetingId(item.id ?? null);
    };

    const handleDeleteClick = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setPendingDeleteId(id);
    };

    const confirmDelete = async () => {
        if (pendingDeleteId === null) return;
        try {
            await window.electron.db.deleteItem('meetings', pendingDeleteId);
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
                const electron = window.electron;
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
                        window.electron?.settings?.sendStatus('ready', 'Ignored (Silence)');
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
                window.electron?.settings?.sendStatus('error', 'Recording failed');
            }
        } else {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
            window.electron?.settings?.sendStatus('processing', 'Processing Audio...');
        }
    };

    const processAudio = async (arrayBuffer: ArrayBuffer) => {
        if (!window.electron?.ai) return;

        setIsProcessing(true);
        window.electron?.settings?.sendStatus('processing', 'Transcribing...');
        try {
            // 1. Transcribe (Whisper)
            const text = await window.electron.ai.transcribe(arrayBuffer);
            setTranscript(text);

            window.electron?.settings?.sendStatus('ready', 'Transcript Ready');
        } catch (err: any) {
            console.error("AI Processing failed", err);
            setTranscript("Error: " + err.message);

            const msg = (err.message as string) || 'AI Failed';
            if (msg.includes('API Key not found')) {
                window.electron?.settings?.sendStatus('error', 'NO API KEY');
            } else if (msg.includes('Whisper API failed')) {
                window.electron?.settings?.sendStatus('error', 'WHISPER API ERROR');
            } else {
                window.electron?.settings?.sendStatus('error', 'AI FAILED');
            }
        } finally {
            setIsProcessing(false);
            // Reset to ready if not error
            window.electron?.settings?.sendStatus('ready', 'Ready');
        }
    };

    const handleExportItem = (item: Meeting, e: React.MouseEvent) => {
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
        <div className="flex h-screen flex-col bg-background text-foreground font-sans overflow-hidden">
            {/* --- TOP BRAND BAR --- */}
            <div className="flex items-center justify-center py-2 border-b border-border bg-card/50">
                <button
                    onClick={() => router.push('/')}
                    className="transition-opacity focus:outline-none cursor-pointer p-0 m-0 border-none bg-transparent"
                    title="Go Home"
                >
                    <img
                        src="/logo.png"
                        alt="LAZY Logo"
                        className="h-12 w-auto object-contain dark:filter dark:grayscale dark:brightness-0 dark:invert-[1]"
                    />
                </button>
            </div>

            {/* --- ACTIONS HEADER --- */}
            <header className="flex items-center justify-between px-8 py-4 bg-muted/20 border-b border-border">
                <div className="flex items-center gap-6 min-w-0">
                    <Input
                        placeholder="Meeting Title..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-80"
                    />

                    <div className="flex items-center gap-2">
                        <Button
                            variant={isRecording ? 'destructive' : 'primary'}
                            onClick={handleToggleRecording}
                            className={isRecording ? 'animate-pulse' : ''}
                        >
                            <Mic size={16} className="mr-2" />
                            {isRecording ? "Stop Recording" : "Start Recording"}
                        </Button>

                        {isRecording && (
                            <div className="flex items-center gap-3 px-3 py-1.5 bg-background rounded-md border border-border shadow-inner">
                                <span className="text-sm font-mono text-foreground font-medium w-12">{formatTime(recordingTime)}</span>
                                <Waveform stream={stream} className="w-24 h-6" />
                            </div>
                        )}

                        {isProcessing && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/30 rounded-md">
                                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                                <span className="text-xs font-medium text-muted-foreground mr-1">AI Processing...</span>
                            </div>
                        )}
                    </div>
                </div>

                <Button
                    variant={showHistory ? 'secondary' : 'outline'}
                    onClick={() => setShowHistory(!showHistory)}
                    title="View History"
                >
                    {showHistory ? 'Hide History' : 'History'}
                </Button>
            </header>

            {/* --- CONTENT --- */}
            <main className="flex-1 flex overflow-hidden p-4 gap-4">

                {/* HISTORY SIDEBAR */}
                {showHistory && (
                    <aside className="w-80 flex flex-col min-w-[280px]">
                        <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                            <div className="px-4 py-3 border-b border-border bg-muted/50">
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-center flex items-center justify-center gap-2">
                                    <History size={14} /> Saved Meetings
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {historyItems.length === 0 ? (
                                    <div className="text-center py-10 opacity-30 italic text-sm text-muted-foreground">No meetings yet</div>
                                ) : historyItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleSelectMeeting(item)}
                                        className={`group flex items-center justify-between p-3 rounded-md cursor-pointer transition-all ${selectedMeetingId === item.id
                                            ? "bg-primary/10 border border-primary/20 shadow-sm"
                                            : "hover:bg-secondary border border-transparent"
                                            }`}
                                    >
                                        <div className="flex flex-col min-w-0 mr-3">
                                            <div className="font-semibold text-xs text-foreground truncate" title={item.title || "Untitled"}>
                                                {item.title || "Untitled"}
                                            </div>
                                            <span className="text-[10px] text-muted-foreground">
                                                {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown'}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={(e) => handleExportItem(item, e)}
                                                disabled={!item.summary}
                                                title="Export"
                                            >
                                                <Download size={14} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                                onClick={(e) => handleDeleteClick(item.id!, e)}
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                )}

                {/* Left: Transcript (60%) */}
                <div className="flex-[1.5] flex flex-col min-w-0 border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/50">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Transcript
                        </h2>
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setTranscript(""); setSummary(""); setTitle(""); setRecordingTime(0); setSelectedMeetingId(null); }}
                                className="text-xs h-7"
                            >
                                Clear / New
                            </Button>
                            <span className="text-xs text-muted-foreground font-mono">
                                {(transcript || "").split(/\s+/).filter(w => w).length} words
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 p-6 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed bg-background/50">
                        {transcript || (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm text-center px-8 opacity-50">
                                <p>Your transcription will appear here as you speak.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Summary (40%) */}
                <div className="flex-1 flex flex-col min-w-0 border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/50">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            OUTPUT
                        </h2>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={async () => {
                                    if (!transcript || !window.electron?.ai) return;
                                    setIsProcessing(true);
                                    window.electron.settings.sendStatus('processing', 'Summarizing...');
                                    try {
                                        const summaryResult = await window.electron.ai.summarizeMeeting(transcript);
                                        setSummary(summaryResult);
                                        window.electron.settings.sendStatus('ready', 'Ready');
                                    } catch (err) {
                                        console.error("Summary failed", err);
                                        window.electron.settings.sendStatus('error', 'Summary Failed');
                                    } finally {
                                        setIsProcessing(false);
                                    }
                                }}
                                disabled={!transcript || isProcessing}
                                isLoading={isProcessing}
                            >
                                Generate
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={async () => {
                                    if (!transcript || !summary || !window.electron?.db) return;
                                    try {
                                        await window.electron.db.saveMeeting(
                                            title || "Untitled Meeting",
                                            transcript,
                                            summary
                                        );
                                        setAlertMessage("Meeting saved successfully!");
                                        loadHistory();
                                    } catch (err) {
                                        console.error("Failed to save meeting", err);
                                    }
                                }}
                                title="Save"
                            >
                                <Save size={16} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                    navigator.clipboard.writeText(summary);
                                    setAlertMessage("Copied to clipboard!");
                                }}
                                title="Copy"
                            >
                                <Copy size={16} />
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 p-5 overflow-y-auto bg-background/50">
                        {summary ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown>{summary}</ReactMarkdown>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm text-center px-8 opacity-50">
                                <p>AI Summary will be generated after the meeting.</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* --- MODALS --- */}
            <Modal
                isOpen={!!alertMessage}
                onClose={() => setAlertMessage(null)}
                title="Notification"
                footer={
                    <Button onClick={() => setAlertMessage(null)}>
                        OK
                    </Button>
                }
            >
                <p className="py-4 text-center">{alertMessage}</p>
            </Modal>

            <Modal
                isOpen={pendingDeleteId !== null}
                onClose={() => setPendingDeleteId(null)}
                title="Delete Meeting"
                footer={
                    <div className="flex gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setPendingDeleteId(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                        >
                            Delete
                        </Button>
                    </div>
                }
            >
                <p className="py-4">Are you sure you want to permanently delete this meeting? This action cannot be undone.</p>
            </Modal>
        </div>
    );
}
