"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, Copy, Download, Trash2, Mic } from "lucide-react";
import Waveform from "../components/Waveform";
import Modal from "../components/Modal";
import Button from "../components/Button";
import type { Meeting } from "../../main/types";

type AudioContextCtor = typeof AudioContext;
type ExtendedWindow = Window & { webkitAudioContext?: AudioContextCtor };
const SILENCE_THRESHOLD = 6;
const DEFAULT_MEETING_TITLE = "Untitled Meeting";
const MAX_RECORDING_SECONDS = 90 * 60;
const AUDIO_BITS_PER_SECOND = 24_000;

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
    const recordingPartsRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const outputEditorRef = useRef<HTMLDivElement | null>(null);
    const syncingOutputRef = useRef(false);

    // VAD Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const maxVolumeRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);

    useEffect(() => {
        if (isRecording) {
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => {
                    const next = prev + 1;
                    if (next >= MAX_RECORDING_SECONDS) {
                        mediaRecorderRef.current?.stop();
                        setIsRecording(false);
                        setAlertMessage("Recording stopped at 90:00 to keep transcription reliable.");
                        window.electron?.settings?.sendStatus('processing', 'Max length reached, processing...');
                        return MAX_RECORDING_SECONDS;
                    }
                    return next;
                });
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
        maxVolumeRef.current = 0;

        const dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
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

    const setTranscriptionErrorStatus = (message: string) => {
        if (message.includes('API Key not found')) {
            window.electron?.settings?.sendStatus('error', 'NO API KEY');
            return;
        }
        if (message.includes('HTTP 413')) {
            window.electron?.settings?.sendStatus('error', 'AUDIO TOO LARGE');
            return;
        }
        if (message.includes('Whisper API failed')) {
            window.electron?.settings?.sendStatus('error', 'WHISPER API ERROR');
            return;
        }
        window.electron?.settings?.sendStatus('error', 'AI FAILED');
    };

    const isPayloadTooLargeError = (message: string) => message.includes('HTTP 413');

    const transcribeBlob = async (blob: Blob): Promise<string> => {
        if (!window.electron?.ai) {
            throw new Error("AI service is unavailable");
        }
        const arrayBuffer = await blob.arrayBuffer();
        const text = await window.electron.ai.transcribe(arrayBuffer);
        if (!text || !text.trim()) {
            throw new Error("Transcription returned empty result");
        }
        return text.trim();
    };

    const transcribePartsWithFallback = async (parts: Blob[]): Promise<string> => {
        if (parts.length === 0) {
            throw new Error("No audio data available");
        }

        try {
            return await transcribeBlob(new Blob(parts, { type: "audio/webm" }));
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Transcription failed";
            if (!isPayloadTooLargeError(message)) {
                throw err instanceof Error ? err : new Error(message);
            }

            if (parts.length < 2) {
                throw new Error("Audio too large to process in one pass. Please record a shorter session.");
            }

            const splitIndex = Math.floor(parts.length / 2);
            const leftParts = parts.slice(0, splitIndex);
            const rightParts = parts.slice(splitIndex);
            window.electron?.settings?.sendStatus('processing', 'Audio too large, splitting and retrying...');

            const leftText = await transcribePartsWithFallback(leftParts);
            const rightText = await transcribePartsWithFallback(rightParts);

            if (leftText && rightText) return `${leftText}\n${rightText}`;
            return leftText || rightText;
        }
    };

    const transcribeRecording = async (parts: Blob[]) => {
        setIsProcessing(true);
        window.electron?.settings?.sendStatus('processing', 'Transcribing...');

        try {
            const text = await transcribePartsWithFallback(parts);
            setTranscript(text);
            window.electron?.settings?.sendStatus('ready', 'Transcript Ready');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Transcription failed";
            setTranscript(`Error: ${msg}`);
            setTranscriptionErrorStatus(msg);
            console.error("Transcription failed", err);
        } finally {
            setIsProcessing(false);
        }
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
                    audio: selectedMic
                        ? { deviceId: { exact: selectedMic }, channelCount: 1 }
                        : { channelCount: 1 }
                };

                const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
                setStream(mediaStream);

                // Start VAD
                startVAD(mediaStream);

                const preferredMimeType = 'audio/webm;codecs=opus';
                const options: MediaRecorderOptions = {
                    audioBitsPerSecond: AUDIO_BITS_PER_SECOND
                };
                if (MediaRecorder.isTypeSupported(preferredMimeType)) {
                    options.mimeType = preferredMimeType;
                }
                const recorder = new MediaRecorder(mediaStream, options);
                mediaRecorderRef.current = recorder;
                recordingPartsRef.current = [];
                setTranscript("");

                recorder.ondataavailable = (e) => {
                    if (e.data.size === 0) return;
                    recordingPartsRef.current.push(e.data);
                };

                recorder.onstop = async () => {
                    stopVAD();
                    // Silence Check
                    if (maxVolumeRef.current < SILENCE_THRESHOLD) {
                        console.warn("Audio too quiet, dropping.");
                        window.electron?.settings?.sendStatus('warning', 'IGNORED (SILENCE)');
                        setStream(null);
                        mediaStream.getTracks().forEach(t => t.stop());
                        return;
                    }

                    if (recordingPartsRef.current.length === 0) {
                        window.electron?.settings?.sendStatus('warning', 'No audio captured');
                        setStream(null);
                        mediaStream.getTracks().forEach(t => t.stop());
                        return;
                    }

                    const parts = recordingPartsRef.current.slice();
                    recordingPartsRef.current = [];
                    await transcribeRecording(parts);

                    // Stop all tracks
                    mediaStream.getTracks().forEach(t => t.stop());
                    setStream(null);
                };

                recorder.start(1000); // Keep memory bounded while still producing a single final file.
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

    const hasValidMeetingTitle = () => {
        const normalized = title.trim();
        return normalized !== "" && normalized.toLowerCase() !== DEFAULT_MEETING_TITLE.toLowerCase();
    };

    const escapeHtml = (input: string) =>
        input
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    const inlineMarkdownToHtml = (line: string) => {
        const escaped = escapeHtml(line);
        return escaped
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>");
    };

    const markdownToHtml = (markdown: string) => {
        const lines = markdown.split(/\r?\n/);
        const html: string[] = [];
        let inList = false;
        const sectionHeaderRegex = /^(tl;dr|summary|key discussion points|description|acceptance criteria|action items|conclusion)\s*:?\s*$/i;

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
                if (inList) {
                    html.push("</ul>");
                    inList = false;
                }
                continue;
            }

            const headingMatch = line.match(/^#{1,6}\s*(.+)$/);
            if (headingMatch) {
                if (inList) {
                    html.push("</ul>");
                    inList = false;
                }
                const headingText = headingMatch[1].trim();
                html.push(`<h2>${inlineMarkdownToHtml(headingText)}</h2>`);
                continue;
            }

            const boldHeadingMatch = line.match(/^\*\*(.+?)\*\*:?\s*$/);
            if (boldHeadingMatch) {
                if (inList) {
                    html.push("</ul>");
                    inList = false;
                }
                html.push(`<h2>${inlineMarkdownToHtml(boldHeadingMatch[1].trim())}</h2>`);
                continue;
            }

            if (sectionHeaderRegex.test(line)) {
                if (inList) {
                    html.push("</ul>");
                    inList = false;
                }
                html.push(`<h2>${inlineMarkdownToHtml(line.replace(/:$/, "").trim())}</h2>`);
                continue;
            }

            const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
            const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
            if (bulletMatch || orderedMatch) {
                if (!inList) {
                    html.push("<ul>");
                    inList = true;
                }
                const itemText = (bulletMatch?.[1] || orderedMatch?.[1] || "").trim();
                html.push(`<li>${inlineMarkdownToHtml(itemText)}</li>`);
                continue;
            }

            if (inList) {
                html.push("</ul>");
                inList = false;
            }
            html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
        }

        if (inList) html.push("</ul>");
        return html.join("");
    };

    const htmlToMarkdown = (html: string) => {
        if (typeof window === "undefined") return "";
        const container = document.createElement("div");
        container.innerHTML = html;
        const lines: string[] = [];

        const pushBlock = (value: string) => {
            const trimmed = value.trim();
            if (trimmed) lines.push(trimmed);
            lines.push("");
        };

        Array.from(container.children).forEach((el) => {
            const tag = el.tagName.toLowerCase();
            if (tag === "h2") {
                pushBlock(`## ${el.textContent || ""}`);
                return;
            }
            if (tag === "ul") {
                Array.from(el.querySelectorAll("li")).forEach((li) => {
                    lines.push(`- ${(li.textContent || "").trim()}`);
                });
                lines.push("");
                return;
            }
            pushBlock(el.textContent || "");
        });

        return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    };

    useEffect(() => {
        if (!outputEditorRef.current) return;
        const html = markdownToHtml(summary);
        if (outputEditorRef.current.innerHTML !== html) {
            syncingOutputRef.current = true;
            outputEditorRef.current.innerHTML = html;
            queueMicrotask(() => {
                syncingOutputRef.current = false;
            });
        }
    }, [summary]);

    return (
        <div className="flex h-full flex-col bg-background text-foreground font-sans overflow-hidden">
            {/* --- TOP BRAND BAR --- */}
            <div className="relative h-24 border-b border-border bg-card/50">
                <button
                    onClick={() => router.push('/')}
                    className="absolute inset-0 flex items-center justify-center transition-opacity focus:outline-none cursor-pointer p-0 m-0 border-none bg-transparent"
                    title="Go Home"
                >
                    <img
                        src="/logo.png"
                        alt="LAZY Logo"
                        className="h-32 w-auto object-contain dark:filter dark:grayscale dark:brightness-0 dark:invert-[1]"
                    />
                </button>
            </div>

            {/* --- ACTIONS HEADER --- */}
            <header className="flex items-center justify-between px-3 py-1.5 bg-muted/20 border-b border-border">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <input
                        placeholder="Meeting Title..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="h-7 w-[360px] min-w-0 rounded-md border border-border bg-secondary px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />

                    <div className="flex items-center gap-1.5">
                        <Button
                            variant={isRecording ? 'destructive' : 'primary'}
                            onClick={handleToggleRecording}
                            size="sm"
                            className={"h-7 px-3 text-[10px] uppercase font-bold tracking-wider " + (isRecording ? "animate-pulse" : "")}
                        >
                            <Mic size={12} className="mr-1.5" />
                            {isRecording ? "Stop" : "Record"}
                        </Button>

                        {isRecording && (
                            <div className="flex items-center gap-2 px-2 py-0.5 bg-background rounded border border-border shadow-inner h-7">
                                <span className="text-[10px] font-mono text-foreground font-medium w-9 italic text-center text-red-500">{formatTime(recordingTime)}</span>
                                <Waveform stream={stream} className="w-16 h-4" />
                            </div>
                        )}

                        {isProcessing && (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-secondary/30 rounded h-7">
                                <div className="w-1 h-1 bg-primary rounded-full animate-bounce" />
                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Processing...</span>
                            </div>
                        )}

                        <button
                            onClick={() => { setTranscript(""); setSummary(""); setTitle(""); setRecordingTime(0); setSelectedMeetingId(null); }}
                            className="ml-32 h-7 px-2 text-[10px] font-bold italic uppercase tracking-wider text-green-600 dark:text-green-400 underline underline-offset-2 cursor-pointer hover:text-green-700 dark:hover:text-green-300 hover:opacity-90 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 rounded-sm"
                            title="Start New Session"
                        >
                            New Session
                        </button>
                    </div>
                </div>

                <Button
                    variant={showHistory ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => setShowHistory(!showHistory)}
                    className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider"
                    title="View History"
                >
                    {showHistory ? 'Hide History' : 'History'}
                </Button>
            </header>

            {/* --- CONTENT --- */ }
        < div className = "flex-1 flex overflow-hidden p-1 gap-1" >

            {/* HISTORY SIDEBAR */ }
    {
        showHistory && (
            <aside className="w-64 flex flex-col">
                <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                    <div className="flex h-8 items-center justify-center px-3 border-b border-border bg-muted/50">
                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">
                            SAVED MEETINGS
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
                        {historyItems.length === 0 ? (
                            <div className="text-center py-6 opacity-30 italic text-sm text-muted-foreground">No history</div>
                        ) : historyItems.map(item => (
                            <div
                                key={item.id}
                                onClick={() => handleSelectMeeting(item)}
                                className={`group flex items-center justify-between p-2.5 rounded-md cursor-pointer transition-all border ${selectedMeetingId === item.id
                                    ? "bg-primary/10 border-primary/25 shadow-sm"
                                    : "bg-background/80 border-border hover:bg-secondary/60"
                                    }`}
                            >
                                <div className="flex flex-col min-w-0 mr-2">
                                    <div className="font-semibold text-sm text-foreground truncate" title={item.title || "Untitled"}>
                                        {item.title || "Untitled"}
                                    </div>
                                    <span className="text-xs text-muted-foreground font-medium">
                                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown'}
                                    </span>
                                </div>

                                <div className="flex items-center overflow-hidden rounded-md border border-border bg-background/70">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 p-0 rounded-none border-0 bg-transparent hover:bg-secondary/70"
                                        onClick={(e) => handleExportItem(item, e)}
                                        disabled={!item.summary}
                                        title="Export"
                                    >
                                        <Download size={14} />
                                    </Button>
                                    <div className="h-8 w-px bg-border" />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 p-0 rounded-none border-0 bg-transparent text-destructive hover:bg-destructive/10"
                                        onClick={(e) => handleDeleteClick(item.id!, e)}
                                        title="Delete"
                                    >
                                        <Trash2 size={14} className="text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>
        )
    }

    {/* Left: Transcript (50%) */ }
    <div className="flex-1 flex flex-col min-w-0 border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="relative flex h-8 items-center justify-center px-3 border-b border-border bg-muted/50">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                TRANSCRIPT
            </h2>
            <div className="absolute right-3 flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground font-mono italic">
                    {(transcript || "").split(/\s+/).filter(w => w).length} words
                </span>
            </div>
        </div>

        <div className="flex-1 p-3 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed bg-background/50 text-foreground">
            {transcript || (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-[10px] text-center px-6 opacity-40">
                    <p>Speak to begin transcription...</p>
                </div>
            )}
        </div>
    </div>

    {/* Right: Summary (50%) */ }
    <div className="flex-1 flex flex-col min-w-0 border border-border rounded-lg bg-card overflow-hidden shadow-sm">
        <div className="relative flex h-8 items-center justify-center px-3 border-b border-border bg-muted/50">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                OUTPUT
            </h2>
            <div className="absolute right-2 flex items-center gap-1.5">
                <Button
                    size="sm"
                    className="h-6 text-[9px] px-2 font-bold uppercase shrink-0"
                    onClick={async () => {
                        if (!transcript || !window.electron?.ai) return;
                        setIsProcessing(true);
                        window.electron.settings.sendStatus('processing', 'Summarizing...');
                        try {
                            const summaryResult = await window.electron.ai?.summarizeMeeting(transcript);
                            if (!summaryResult) throw new Error("Summary generation failed");
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
                <div className="flex h-6 shrink-0 items-center overflow-hidden rounded-md bg-background/80 ring-1 ring-border">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0 rounded-none border-0 bg-transparent hover:bg-secondary/70"
                        onClick={async () => {
                            if (!transcript || !summary || !window.electron?.db) return;
                            if (!hasValidMeetingTitle()) {
                                setAlertMessage("Please create a meeting title before saving.");
                                return;
                            }
                            try {
                                await window.electron.db.saveMeeting(
                                    title.trim(),
                                    transcript,
                                    summary
                                );
                                setAlertMessage("Meeting saved!");
                                loadHistory();
                            } catch (err) {
                                console.error("Failed to save", err);
                            }
                        }}
                        title="Save"
                    >
                        <Save size={12} />
                    </Button>
                    <div className="h-6 w-px bg-border" />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0 rounded-none border-0 bg-transparent hover:bg-secondary/70"
                        onClick={() => {
                            if (!hasValidMeetingTitle()) {
                                setAlertMessage("Please create a meeting title before copying.");
                                return;
                            }
                            if (!summary) return;
                            navigator.clipboard.writeText(summary);
                            setAlertMessage("Copied!");
                        }}
                        title="Copy"
                    >
                        <Copy size={12} />
                    </Button>
                </div>
            </div>
        </div>

                    <div className="flex-1 p-3 overflow-y-auto bg-background/50 text-sm leading-relaxed text-foreground">
                        {summary ? (
                            <div className="rounded-md border border-border bg-background p-2">
                                    <div
                                        ref={outputEditorRef}
                                        contentEditable
                                        suppressContentEditableWarning
                                        onInput={(e) => {
                                            if (syncingOutputRef.current) return;
                                            setSummary(htmlToMarkdown((e.currentTarget as HTMLDivElement).innerHTML));
                                        }}
                                        className="prose prose-sm dark:prose-invert max-w-none min-h-[260px] focus:outline-none [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1"
                                    />
                                </div>
                        ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-[10px] text-center px-4 opacity-40">
                    <p>Summary appears here after generation.</p>
                </div>
            )}
        </div>
    </div>
            </div >

        {/* --- MODALS --- */ }
        < Modal
    isOpen = {!!alertMessage
}
onClose = {() => setAlertMessage(null)}
title = "Notification"
footer = {
                    < Button onClick = {() => setAlertMessage(null)} size = "sm" >
    OK
                    </Button >
                }
            >
    <p className="py-2 text-center text-sm">{alertMessage}</p>
            </Modal >

    <Modal
        isOpen={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        title="Confirm Delete"
        footer={
            <div className="flex gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingDeleteId(null)}
                >
                    Cancel
                </Button>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={confirmDelete}
                >
                    Delete
                </Button>
            </div>
        }
    >
        <p className="py-2 text-sm text-muted-foreground">Permanently delete this meeting session? This cannot be undone.</p>
    </Modal>
        </div >
    );
}
