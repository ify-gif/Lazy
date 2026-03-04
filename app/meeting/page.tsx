"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, ChevronRight, ChevronDown, Folder, Save, Copy, Download, Trash2, Mic, ListChecks, ArrowRight, CheckCircle2, XCircle, Loader2, Share2 } from "lucide-react";
import Waveform from "../components/Waveform";
import Modal from "../components/Modal";
import Button from "../components/Button";
import type { Meeting, ActionItem, Thread, MeetingTemplate, LanPeer, TeamSharePacket, TeamShareEvent } from "../../main/types";
import { downloadLazyShareFile } from "../lib/lazyshare";

type ActionItemStatus = 'idle' | 'pushing' | 'pushed' | 'failed';

interface ActionItemUI extends ActionItem {
    status: ActionItemStatus;
}

type AudioContextCtor = typeof AudioContext;
type ExtendedWindow = Window & { webkitAudioContext?: AudioContextCtor };
const SILENCE_THRESHOLD = 6;
const DEFAULT_MEETING_TITLE = "Untitled Meeting";
const MAX_RECORDING_SECONDS = 90 * 60;
const AUDIO_BITS_PER_SECOND = 24_000;

interface HistoryItemProps {
    item: Meeting;
    isSelected: boolean;
    onSelect: () => void;
}

const HistoryItem = ({ item, isSelected, onSelect, onMenuOpen }: HistoryItemProps & { onMenuOpen: (item: Meeting, e: React.MouseEvent) => void }) => (
    <div
        onClick={onSelect}
        className={`group flex items-center justify-between p-1.5 rounded-md cursor-pointer transition-all border ${isSelected
            ? "bg-primary/10 border-primary/25 shadow-sm"
            : "bg-background/80 border-border hover:bg-secondary/60"
            }`}
    >
        <div className="flex flex-col min-w-0 mr-1.5">
            <div className="font-bold text-[11px] leading-snug text-foreground truncate" title={item.title || "Untitled"}>
                {item.title || "Untitled"}
            </div>
            <span className="text-[9px] leading-none text-muted-foreground">
                {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown'}
            </span>
        </div>

        <div className="flex items-center">
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 p-0 rounded-md border-0 bg-transparent hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
                onClick={(e) => onMenuOpen(item, e)}
                title="Actions"
            >
                <MoreVertical size={14} />
            </Button>
        </div>
    </div>
);

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
    const [pendingDeleteThreadId, setPendingDeleteThreadId] = useState<number | null>(null);
    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const [lanPeers, setLanPeers] = useState<LanPeer[]>([]);
    const [pendingSendPacket, setPendingSendPacket] = useState<TeamSharePacket | null>(null);

    // Action Items state
    const [actionItems, setActionItems] = useState<ActionItemUI[]>([]);
    const [isExtractingItems, setIsExtractingItems] = useState(false);
    const [actionItemsVisible, setActionItemsVisible] = useState(false);

    // Threads state
    const [threads, setThreads] = useState<Thread[]>([]);
    const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
    const [isAddingThread, setIsAddingThread] = useState(false);
    const [newThreadName, setNewThreadName] = useState("");
    const [expandedThreads, setExpandedThreads] = useState<Set<number>>(new Set());

    // Context Menu State
    const [menuAnchor, setMenuAnchor] = useState<{ x: number, y: number, item: Meeting } | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isThreadSubmenuOpen, setIsThreadSubmenuOpen] = useState(false);
    const [isThreadDropdownOpen, setIsThreadDropdownOpen] = useState(false);
    const threadDropdownRef = useRef<HTMLDivElement>(null);

    // Template State
    const [selectedTemplate, setSelectedTemplate] = useState<MeetingTemplate>('standard');
    const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
    const templateDropdownRef = useRef<HTMLDivElement>(null);

    const loadHistory = async () => {
        if (!window.electron?.db) return;
        try {
            const data = await window.electron.db.getMeetings();
            setHistoryItems(data);
        } catch (err) {
            console.error("Failed to load meeting history", err);
        }
    };

    const loadThreads = async () => {
        if (!window.electron?.db) return;
        try {
            const data = await window.electron.db.getThreads();
            setThreads(data);
        } catch (err) {
            console.error("Failed to load threads", err);
        }
    };

    const loadLanPeers = async () => {
        if (!window.electron?.team) return;
        try {
            const peers = await window.electron.team.getPeers();
            setLanPeers(peers);
        } catch (err) {
            console.error("Failed to load LAN peers", err);
        }
    };

    useEffect(() => {
        loadHistory();
        loadThreads();
        loadLanPeers();

        const handleClickOutside = (event: MouseEvent) => {
            if (threadDropdownRef.current && !threadDropdownRef.current.contains(event.target as Node)) {
                setIsThreadDropdownOpen(false);
            }
            if (templateDropdownRef.current && !templateDropdownRef.current.contains(event.target as Node)) {
                setIsTemplateDropdownOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!window.electron?.team) return;
        const unsubscribe = window.electron.team.onEvent((event: TeamShareEvent) => {
            if (event.event === 'peers-updated') {
                void loadLanPeers();
            }
            if (event.event === 'share-imported') {
                void loadHistory();
                setAlertMessage("Received shared item from teammate.");
            }
        });
        return unsubscribe;
    }, []);

    const toggleThread = (threadId: number) => {
        const next = new Set(expandedThreads);
        if (next.has(threadId)) next.delete(threadId);
        else next.add(threadId);
        setExpandedThreads(next);
    };

    const handleUpdateMeetingThread = async (meetingId: number, threadId: number | null) => {
        if (!window.electron?.db) return;
        try {
            await window.electron.db.updateMeetingThread(meetingId, threadId);
            await loadHistory();
            setMenuAnchor(null);
            setIsMenuOpen(false);
        } catch (err) {
            console.error("Failed to update meeting thread", err);
        }
    };

    const handleMenuOpen = (item: Meeting, e: React.MouseEvent) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuAnchor({
            x: rect.right,
            y: rect.top,
            item
        });
        setIsMenuOpen(true);
        setIsThreadSubmenuOpen(false);
    };

    const handleSelectMeeting = (item: Meeting) => {
        setTitle(item.title);
        setTranscript(item.transcript);
        setSummary(item.summary);
        setSelectedMeetingId(item.id ?? null);
        setSelectedThreadId(item.thread_id ?? null);
    };

    const handleCreateThread = async () => {
        if (!newThreadName.trim() || !window.electron?.db) return;
        try {
            const threadId = await window.electron.db.saveThread(newThreadName.trim());
            await loadThreads();
            setSelectedThreadId(threadId);
            setNewThreadName("");
            setIsAddingThread(false);
        } catch (err) {
            console.error("Failed to create thread", err);
        }
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

    const confirmDeleteThread = async () => {
        if (pendingDeleteThreadId === null) return;
        try {
            await window.electron.db.deleteThread(pendingDeleteThreadId);
            loadThreads();
            loadHistory();
            window.electron.settings.sendStatus('ready', 'Thread deleted');
        } catch (err) {
            console.error("Delete thread failed", err);
            window.electron.settings.sendStatus('error', 'Failed to delete thread');
        } finally {
            setPendingDeleteThreadId(null);
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

    const handleExportLazyShare = (item: Meeting, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!item.summary && !item.transcript) return;
        downloadLazyShareFile(
            {
                version: 1,
                kind: 'meeting',
                shared_at: new Date().toISOString(),
                payload: {
                    title: item.title || DEFAULT_MEETING_TITLE,
                    transcript: item.transcript || "",
                    summary: item.summary || "",
                    created_at: item.created_at || new Date().toISOString(),
                },
            },
            item.title || "meeting-share"
        );
    };

    const openSendMeetingModal = (item: Meeting, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setPendingSendPacket({
            version: 1,
            kind: 'meeting',
            shared_at: new Date().toISOString(),
            payload: {
                title: item.title || DEFAULT_MEETING_TITLE,
                transcript: item.transcript || "",
                summary: item.summary || "",
                created_at: item.created_at || new Date().toISOString(),
            },
        });
        setIsSendModalOpen(true);
        void loadLanPeers();
    };

    const handleSendToPeer = async (peerDeviceId: string) => {
        if (!window.electron?.team || !pendingSendPacket) return;
        try {
            await window.electron.team.sendShare(peerDeviceId, pendingSendPacket);
            setIsSendModalOpen(false);
            setPendingSendPacket(null);
            setAlertMessage("Meeting sent over LAN.");
        } catch (err) {
            console.error("Failed to send LAN meeting", err);
            setAlertMessage("Could not send to selected teammate.");
        }
    };

    const hasValidMeetingTitle = () => {
        const normalized = title.trim();
        return normalized !== "" && normalized.toLowerCase() !== DEFAULT_MEETING_TITLE.toLowerCase();
    };

    // --- Action Items Handlers ---
    const handleExtractActionItems = async () => {
        if (!summary || !window.electron?.ai) return;
        setIsExtractingItems(true);
        try {
            const items = await window.electron.ai.extractActionItems(summary);
            if (!items || items.length === 0) {
                setAlertMessage("No action items found in this summary.");
                setActionItems([]);
                setActionItemsVisible(false);
            } else {
                setActionItems(items.map(item => ({ ...item, status: 'idle' as ActionItemStatus })));
                setActionItemsVisible(true);
            }
        } catch (err) {
            console.error("Failed to extract action items", err);
            setAlertMessage("Failed to extract action items. Please try again.");
        } finally {
            setIsExtractingItems(false);
        }
    };

    const handlePushToTracker = async (index: number) => {
        const item = actionItems[index];
        if (!item || item.status === 'pushed' || item.status === 'pushing') return;
        if (!window.electron?.ai || !window.electron?.db) return;

        setActionItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'pushing' as ActionItemStatus } : it));

        try {
            const storyResult = await window.electron.ai.generateStoryFromActionItem(item.text, summary);
            const storyTitle = storyResult.summary || item.text.slice(0, 60);
            await window.electron.db.saveWorkStory(
                'story',
                item.text,
                storyResult.description,
                undefined,
                storyTitle,
                selectedMeetingId ?? undefined
            );
            setActionItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'pushed' as ActionItemStatus } : it));
        } catch (err) {
            console.error("Failed to push action item", err);
            setActionItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'failed' as ActionItemStatus } : it));
        }
    };

    const handlePushAllToTracker = async () => {
        const unpushed = actionItems.map((item, i) => ({ item, i })).filter(({ item }) => item.status === 'idle' || item.status === 'failed');
        for (const { i } of unpushed) {
            await handlePushToTracker(i);
        }
    };

    const allPushed = actionItems.length > 0 && actionItems.every(it => it.status === 'pushed');
    const anyPushing = actionItems.some(it => it.status === 'pushing');
    const pushableCount = actionItems.filter(it => it.status === 'idle' || it.status === 'failed').length;

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
                    className="absolute inset-0 flex items-center justify-center transition-opacity focus:outline-none cursor-pointer p-0 m-0 border-none bg-transparent translate-x-[10px]"
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
            <header className="flex items-center bg-muted/50 border-b border-border h-8">
                {/* LEFT: Title & Threads */}
                <div className="flex items-center flex-1 min-w-0">
                    <input
                        placeholder="Meeting Title..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="h-7 w-[240px] xl:w-[320px] min-w-0 rounded-md border border-border bg-secondary px-3 text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary ml-[10px]"
                    />

                    {/* Thread Selector */}
                    <div className="flex items-center ml-[10px]" ref={threadDropdownRef}>
                        <div className="relative">
                            <button
                                onClick={() => setIsThreadDropdownOpen(!isThreadDropdownOpen)}
                                className="h-7 w-[140px] flex items-center justify-between rounded-md border border-border bg-secondary pl-8 pr-2 text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-secondary/80 focus:outline-none focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
                            >
                                <span className="truncate">
                                    {selectedThreadId
                                        ? threads.find(t => t.id === selectedThreadId)?.name
                                        : "No Thread"}
                                </span>
                                <ChevronDown size={10} className={`text-muted-foreground transition-transform duration-200 ${isThreadDropdownOpen ? 'rotate-180' : ''}`} />
                                <Folder size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            </button>

                            {isThreadDropdownOpen && (
                                <div className="absolute top-full left-0 mt-1 w-full max-h-[250px] overflow-y-auto z-50 rounded-md border border-border bg-popover shadow-lg animate-in fade-in zoom-in-95 duration-100 py-1">
                                    <button
                                        onClick={() => { setSelectedThreadId(null); setIsThreadDropdownOpen(false); }}
                                        className={`w-full text-left px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider transition-colors cursor-pointer ${!selectedThreadId ? 'bg-primary/20 text-primary' : 'text-foreground hover:bg-primary/10'}`}
                                    >
                                        No Thread
                                    </button>
                                    {threads.map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => { setSelectedThreadId(t.id); setIsThreadDropdownOpen(false); }}
                                            className={`w-full text-left px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider transition-colors truncate cursor-pointer ${selectedThreadId === t.id ? 'bg-primary/20 text-primary' : 'text-foreground hover:bg-primary/10'}`}
                                        >
                                            {t.name}
                                        </button>
                                    ))}
                                    <div className="h-px bg-border my-1" />
                                    <button
                                        onClick={() => { setIsAddingThread(true); setIsThreadDropdownOpen(false); }}
                                        className="w-full text-left px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                                    >
                                        + New Thread...
                                    </button>
                                </div>
                            )}
                        </div>

                        {isAddingThread && (
                            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-200">
                                <input
                                    autoFocus
                                    placeholder="Thread Name..."
                                    value={newThreadName}
                                    onChange={(e) => setNewThreadName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateThread();
                                        if (e.key === 'Escape') setIsAddingThread(false);
                                    }}
                                    className="h-7 w-[120px] rounded-md border border-primary/50 bg-background px-2 text-[10px] focus:outline-none"
                                />
                                <Button size="sm" className="h-7 px-2 text-[9px]" onClick={handleCreateThread}>Add</Button>
                                <button
                                    onClick={() => setIsAddingThread(false)}
                                    className="p-1 hover:bg-secondary rounded text-muted-foreground"
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* CENTER: Record Button & Timer */}
                <div className="flex items-center justify-center">
                    <Button
                        variant={isRecording ? 'destructive' : 'primary'}
                        onClick={handleToggleRecording}
                        size="sm"
                        className={"h-7 px-3 text-[10px] uppercase font-bold tracking-wider " + (isRecording ? "animate-pulse" : "")}
                    >
                        <Mic size={12} className="mr-1.5" />
                        {isRecording ? "Stop" : "Record"}
                    </Button>

                    {(isRecording || isProcessing) && (
                        <div className="flex items-center px-2 py-0.5 bg-background rounded border border-border shadow-inner h-7 animate-in zoom-in duration-300">
                            {isRecording && (
                                <>
                                    <span className="text-[10px] font-mono text-foreground font-medium w-9 italic text-center text-red-500">{formatTime(recordingTime)}</span>
                                    <Waveform stream={stream} className="w-16 h-4" />
                                </>
                            )}
                            {isProcessing && (
                                <div className="flex items-center gap-2">
                                    <Loader2 size={12} className="animate-spin text-primary" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-primary">Processing AI Tasks...</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT: Actions & Meta */}
                <div className="flex items-center flex-1">
                    <button
                        onClick={() => { setTranscript(""); setSummary(""); setTitle(""); setRecordingTime(0); setSelectedMeetingId(null); setActionItems([]); setActionItemsVisible(false); }}
                        className="h-7 text-[10px] font-bold italic uppercase tracking-wider text-green-600 dark:text-green-400 underline underline-offset-2 cursor-pointer hover:text-green-700 dark:hover:text-green-300 hover:opacity-90 transition-all focus-visible:outline-none ml-[25px]"
                        title="Clear Current Session"
                    >
                        CLEAR/NEW SESSION
                    </button>

                    <div className="flex-1" />

                    <Button
                        variant={showHistory ? 'secondary' : 'primary'}
                        size="sm"
                        onClick={() => setShowHistory(!showHistory)}
                        className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider shadow-sm mr-[30px]"
                        title="View History"
                    >
                        {showHistory ? 'Hide History' : 'History'}
                    </Button>
                </div>
            </header>

            {/* --- CONTENT --- */}
            <div className="flex-1 flex overflow-hidden p-1 gap-1">

                {/* HISTORY SIDEBAR */}
                {
                    showHistory && (
                        <aside className="w-72 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                            <div className="flex h-8 items-center border-b border-border bg-muted/50 px-2 overflow-hidden">
                                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center flex-1">
                                    SAVED MEETINGS
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
                                {historyItems.length === 0 ? (
                                    <div className="text-center py-6 opacity-30 italic text-sm text-muted-foreground">No history</div>
                                ) : (
                                    <>
                                        {/* Threaded Meetings */}
                                        {threads.map(thread => {
                                            const threadMeetings = historyItems.filter(m => m.thread_id === thread.id);
                                            if (threadMeetings.length === 0) return null;
                                            const isExpanded = expandedThreads.has(thread.id);

                                            return (
                                                <div key={thread.id}>
                                                    <div
                                                        onClick={(e) => { e.stopPropagation(); toggleThread(thread.id); }}
                                                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/40 cursor-pointer group transition-colors relative"
                                                    >
                                                        <ChevronRight
                                                            size={14}
                                                            className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                                        />
                                                        <Folder size={14} className={`transition-colors duration-200 ${isExpanded ? 'text-primary' : 'text-primary/70'}`} />
                                                        <span className={`text-[11px] font-bold uppercase tracking-wider truncate flex-1 transition-colors ${isExpanded ? 'text-foreground' : 'text-foreground/80'}`}>
                                                            {thread.name}
                                                        </span>

                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            {/* Trash Trigger - Red and Always Visible */}
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={(e) => { e.stopPropagation(); setPendingDeleteThreadId(thread.id); }}
                                                                className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                                                title="Delete Thread"
                                                            >
                                                                <Trash2 size={12} />
                                                            </Button>

                                                            {/* Meeting Count */}
                                                            <span className="text-[9px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-full font-mono">
                                                                {threadMeetings.length}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div
                                                        className="grid transition-all duration-300 ease-in-out"
                                                        style={{
                                                            gridTemplateRows: isExpanded ? '1fr' : '0fr',
                                                            opacity: isExpanded ? 1 : 0
                                                        }}
                                                    >
                                                        <div className="overflow-hidden">
                                                            <div className="ml-4 pl-2 border-l border-border/50 py-0.5">
                                                                {threadMeetings.map(item => (
                                                                    <HistoryItem
                                                                        key={item.id}
                                                                        item={item}
                                                                        isSelected={selectedMeetingId === item.id}
                                                                        onSelect={() => handleSelectMeeting(item)}
                                                                        onMenuOpen={handleMenuOpen}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Unthreaded Meetings */}
                                        {historyItems.filter(m => !m.thread_id).length > 0 && (
                                            <div className="space-y-1 pt-1">
                                                {threads.length > 0 && (
                                                    <div className="px-2 py-1">
                                                        <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">Standalone</span>
                                                    </div>
                                                )}
                                                {historyItems.filter(m => !m.thread_id).map(item => (
                                                    <HistoryItem
                                                        key={item.id}
                                                        item={item}
                                                        isSelected={selectedMeetingId === item.id}
                                                        onSelect={() => handleSelectMeeting(item)}
                                                        onMenuOpen={handleMenuOpen}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </aside>
                    )
                }

                {/* Left: Transcript (50%) */}
                <div className="flex-1 flex flex-col min-w-0 border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                    <div className="flex h-8 items-center px-3 bg-muted/50 border-b border-border">
                        <div className="flex-1" /> {/* Left Spacer */}
                        <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center shrink-0">
                            TRANSCRIPT
                        </h2>
                        <div className="flex-1 flex justify-end">
                            <span className="text-[9px] font-mono text-zinc-400 italic">
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

                {/* Right: Output (50%) */}
                <div className="flex-1 flex flex-col min-w-0 border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                    <div className="flex h-8 items-center px-3 border-b border-border bg-muted/50">
                        <div className="flex flex-col items-start shrink-0 mr-auto">
                            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                OUTPUT
                            </h2>
                            {selectedThreadId && (
                                <div className="flex items-center gap-1 text-[8px] font-bold text-primary/60 uppercase tracking-tight">
                                    <Folder size={8} />
                                    <span>{threads.find(t => t.id === selectedThreadId)?.name}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 flex items-center justify-end gap-1.5">
                            {/* Template Selector */}
                            <div className="relative" ref={templateDropdownRef}>
                                <button
                                    onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                                    className="h-6 w-[110px] flex items-center justify-between rounded-md border border-border bg-secondary pl-2.5 pr-1.5 text-[9px] font-bold uppercase tracking-wider text-foreground hover:bg-secondary/80 focus:outline-none focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
                                    title="AI Summary Template"
                                >
                                    <span className="truncate">
                                        {selectedTemplate === 'standard' && "Standard"}
                                        {selectedTemplate === 'standup' && "Stand-Up"}
                                        {selectedTemplate === 'action_items' && "Action Items"}
                                        {selectedTemplate === 'decision_log' && "Decision Log"}
                                    </span>
                                    <ChevronDown size={10} className={`text-muted-foreground transition-transform duration-200 ${isTemplateDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isTemplateDropdownOpen && (
                                    <div className="absolute top-full right-0 mt-1 w-[120px] z-[60] rounded-md border border-border bg-popover shadow-lg animate-in fade-in zoom-in-95 duration-100 py-1">
                                        {[
                                            { id: 'standard', label: 'Standard' },
                                            { id: 'standup', label: 'Stand-Up' },
                                            { id: 'action_items', label: 'Action Items' },
                                            { id: 'decision_log', label: 'Decision Log' }
                                        ].map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => { setSelectedTemplate(t.id as MeetingTemplate); setIsTemplateDropdownOpen(false); }}
                                                className={`w-full text-left px-3 py-1.5 text-[9px] uppercase font-bold tracking-wider transition-colors truncate cursor-pointer ${selectedTemplate === t.id ? 'bg-primary/20 text-primary' : 'text-foreground hover:bg-primary/10'}`}
                                            >
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="w-px h-4 bg-border/60 mx-0.5" />

                            <Button
                                size="sm"
                                className="h-6 text-[9px] px-2 font-bold uppercase shrink-0"
                                onClick={async () => {
                                    if (!transcript || !window.electron?.ai) return;
                                    setIsProcessing(true);
                                    window.electron.settings.sendStatus('processing', 'Summarizing...');
                                    try {
                                        let previousSummary = "";
                                        if (selectedThreadId) {
                                            const threadMeetings = await window.electron.db.getMeetingsByThread(selectedThreadId);
                                            if (threadMeetings.length > 0) {
                                                previousSummary = threadMeetings[threadMeetings.length - 1].summary;
                                            }
                                        }
                                        const summaryResult = await window.electron.ai?.summarizeMeeting(transcript, selectedTemplate, previousSummary); if (!summaryResult) throw new Error("Summary generation failed");
                                        setSummary(summaryResult);
                                        setActionItems([]);
                                        setActionItemsVisible(false);
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
                                <span className="hidden xl:inline">Generate</span>
                            </Button>
                            <Button
                                size="sm"
                                className="h-6 text-[9px] px-2 font-bold uppercase shrink-0"
                                onClick={handleExtractActionItems}
                                disabled={!summary || isExtractingItems || isProcessing}
                                isLoading={isExtractingItems}
                                title="Extract action items from summary"
                            >
                                <ListChecks size={11} className="mr-0 xl:mr-1" />
                                <span className="hidden xl:inline">Actions</span>
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
                                                summary,
                                                selectedThreadId ?? undefined
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
                        {/* Thread Context Breadcrumb */}
                        {selectedThreadId && !summary && (
                            <div className="mb-4 p-2 rounded border border-primary/20 bg-primary/5">
                                <span className="text-[9px] font-bold text-primary uppercase tracking-widest block mb-1">Thread Context Active</span>
                                <p className="text-[10px] text-muted-foreground italic">
                                    Previous summaries in this thread will be used to enrich the next generation.
                                </p>
                            </div>
                        )}

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

                        {/* --- ACTION ITEMS PANEL --- */}
                        {actionItemsVisible && actionItems.length > 0 && (
                            <div className="border-t border-border bg-muted/20">
                                <div className="flex items-center justify-between px-3 py-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <ListChecks size={12} className="text-primary" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                            Action Items ({actionItems.filter(it => it.status === 'pushed').length}/{actionItems.length} pushed)
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {!allPushed && (
                                            <Button
                                                size="sm"
                                                className="h-6 text-[9px] px-2 font-bold uppercase"
                                                onClick={handlePushAllToTracker}
                                                disabled={anyPushing || pushableCount === 0}
                                            >
                                                {anyPushing ? (
                                                    <><Loader2 size={10} className="mr-1 animate-spin" />Pushing...</>
                                                ) : (
                                                    <>Push All to Tracker ({pushableCount})</>
                                                )}
                                            </Button>
                                        )}
                                        <button
                                            className="text-[9px] text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                                            onClick={() => { setActionItemsVisible(false); setActionItems([]); }}
                                            title="Dismiss"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                                <div className="max-h-[200px] overflow-y-auto px-3 pb-2 space-y-1">
                                    {actionItems.map((item, index) => (
                                        <div
                                            key={index}
                                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border transition-all text-xs ${item.status === 'pushed'
                                                ? 'bg-green-500/10 border-green-500/25 text-green-700 dark:text-green-400'
                                                : item.status === 'failed'
                                                    ? 'bg-red-500/10 border-red-500/25 text-red-700 dark:text-red-400'
                                                    : item.status === 'pushing'
                                                        ? 'bg-primary/5 border-primary/20 text-muted-foreground'
                                                        : 'bg-background/80 border-border text-foreground'
                                                }`}
                                        >
                                            {/* Status Icon */}
                                            <div className="shrink-0 w-4">
                                                {item.status === 'pushed' && <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" />}
                                                {item.status === 'failed' && <XCircle size={14} className="text-red-500" />}
                                                {item.status === 'pushing' && <Loader2 size={14} className="animate-spin text-primary" />}
                                                {item.status === 'idle' && <div className="w-3.5 h-3.5 rounded-sm border border-border" />}
                                            </div>

                                            {/* Item Text */}
                                            <div className="flex-1 min-w-0">
                                                <span className={item.status === 'pushed' ? 'line-through opacity-70' : ''}>
                                                    {item.text}
                                                </span>
                                                {item.assignee && (
                                                    <span className="ml-1.5 text-[9px] font-mono px-1 py-0.5 rounded bg-secondary/50 text-muted-foreground">
                                                        @{item.assignee}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Push Button */}
                                            {item.status === 'idle' && (
                                                <button
                                                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                                    onClick={() => handlePushToTracker(index)}
                                                    title="Push to Tracker"
                                                >
                                                    <ArrowRight size={10} />
                                                    Push
                                                </button>
                                            )}
                                            {item.status === 'failed' && (
                                                <button
                                                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                    onClick={() => handlePushToTracker(index)}
                                                    title="Retry"
                                                >
                                                    Retry
                                                </button>
                                            )}
                                            {item.status === 'pushed' && (
                                                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400">Done</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- MODALS --- */}
            <Modal
                isOpen={!!alertMessage}
                onClose={() => setAlertMessage(null)}
                title="Notification"
                footer={
                    <Button onClick={() => setAlertMessage(null)} size="sm">
                        OK
                    </Button>
                }
            >
                <p className="py-2 text-center text-sm">{alertMessage}</p>
            </Modal>

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

            <Modal
                isOpen={isSendModalOpen}
                onClose={() => {
                    setIsSendModalOpen(false);
                    setPendingSendPacket(null);
                }}
                title="Send to Teammate"
            >
                <div className="space-y-2">
                    {lanPeers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No LAN peers found. Open LAZY on teammate device and keep both apps on same network.</p>
                    ) : lanPeers.map((peer) => (
                        <button
                            key={peer.deviceId}
                            className="w-full rounded border border-border bg-background px-3 py-2 text-left hover:bg-secondary/60 cursor-pointer"
                            onClick={() => void handleSendToPeer(peer.deviceId)}
                        >
                            <p className="text-xs font-bold text-foreground">{peer.deviceName}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">{peer.fingerprint} | Code {peer.pairingCode}</p>
                        </button>
                    ))}
                </div>
            </Modal>

            {/* --- CONTEXT MENU --- */}
            {isMenuOpen && menuAnchor && (
                <div
                    className="fixed inset-0 z-[100]"
                    onClick={() => setIsMenuOpen(false)}
                    onContextMenu={(e) => { e.preventDefault(); setIsMenuOpen(false); }}
                >
                    <div
                        className="absolute w-44 rounded-lg bg-card border border-border shadow-xl py-1 animate-in fade-in zoom-in duration-150"
                        style={{
                            left: Math.min(menuAnchor.x + 8, window.innerWidth - 184),
                            top: Math.min(menuAnchor.y, window.innerHeight - 200)
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* THREAD SUBMENU */}
                        <button
                            className="w-full flex items-center justify-between px-3 py-2 text-xs text-foreground hover:bg-primary/10 transition-colors cursor-pointer group"
                            onMouseEnter={() => setIsThreadSubmenuOpen(true)}
                        >
                            <div className="flex items-center gap-2">
                                <Folder size={14} className="text-secondary-foreground/60" />
                                <span>{menuAnchor.item.thread_id ? "Change Thread" : "Add to Thread"}</span>
                            </div>
                            <ChevronRight size={12} className="text-muted-foreground" />
                        </button>

                        {isThreadSubmenuOpen && (
                            <div
                                className="absolute left-full top-0 ml-1 w-44 rounded-lg bg-card border border-border shadow-xl py-1 animate-in fade-in slide-in-from-left-2 duration-150"
                                onMouseLeave={() => setIsThreadSubmenuOpen(false)}
                            >
                                <div className="px-3 py-1.5 border-b border-border mb-1">
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Select Thread</span>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                    {threads.map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => handleUpdateMeetingThread(menuAnchor.item.id!, t.id)}
                                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-primary/10 transition-colors cursor-pointer ${menuAnchor.item.thread_id === t.id ? 'bg-primary/5 font-bold' : ''}`}
                                        >
                                            <Folder size={12} className={menuAnchor.item.thread_id === t.id ? 'text-primary' : 'text-muted-foreground'} />
                                            <span className="truncate">{t.name}</span>
                                        </button>
                                    ))}
                                </div>
                                {menuAnchor.item.thread_id && (
                                    <button
                                        onClick={() => handleUpdateMeetingThread(menuAnchor.item.id!, null)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer border-t border-border mt-1"
                                    >
                                        <XCircle size={12} />
                                        <span>Remove from Thread</span>
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="h-px bg-border my-1" />

                        <button
                            onClick={(e) => { setIsMenuOpen(false); openSendMeetingModal(menuAnchor.item, e); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                            <Share2 size={14} className="text-secondary-foreground/60" />
                            <span>Send on LAN</span>
                        </button>

                        <button
                            onClick={(e) => { setIsMenuOpen(false); handleExportItem(menuAnchor.item, e); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                            <Download size={14} className="text-secondary-foreground/60" />
                            <span>Export Markdown</span>
                        </button>

                        <button
                            onClick={(e) => { setIsMenuOpen(false); handleExportLazyShare(menuAnchor.item, e); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                            <Share2 size={14} className="text-secondary-foreground/60" />
                            <span>Export .lazyshare</span>
                        </button>

                        <button
                            onClick={(e) => { setIsMenuOpen(false); handleDeleteClick(menuAnchor.item.id!, e); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        >
                            <Trash2 size={14} />
                            <span>Delete Meeting</span>
                        </button>
                    </div>
                </div>
            )}
            {/* Delete Thread Confirmation Modal */}
            <Modal
                isOpen={pendingDeleteThreadId !== null}
                onClose={() => setPendingDeleteThreadId(null)}
                title="Delete Thread"
            >
                <div className="space-y-4">
                    <div className="text-sm text-muted-foreground leading-relaxed">
                        Are you sure you want to delete <span className="text-foreground font-bold">&quot;{threads.find(t => t.id === pendingDeleteThreadId)?.name}&quot;</span>?
                        <p className="mt-2 text-[11px] text-primary/70 bg-primary/5 p-2 rounded border border-primary/10 italic">
                            All meetings within this folder will be un-grouped (moved to Standalone). No meetings will be deleted.
                        </p>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setPendingDeleteThreadId(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={confirmDeleteThread}>Delete Folder</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
