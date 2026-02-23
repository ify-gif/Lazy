"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Mic, Plus, Trash2, Copy, Download, Search, Pencil, Check, X
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import Waveform from "../components/Waveform";
import Modal from "../components/Modal";
import Button from "../components/Button";
import type { WorkStory, AIResponse } from "../../main/types";

type AudioContextCtor = typeof AudioContext;
type ExtendedWindow = Window & { webkitAudioContext?: AudioContextCtor };
const SILENCE_THRESHOLD = 6;

export default function TrackerPage() {
    const router = useRouter();

    // State
    const [activeTab, setActiveTab] = useState<'story' | 'comment'>('story');
    const [overview, setOverview] = useState("");
    const [summary, setSummary] = useState("");
    const [jiraStory, setJiraStory] = useState<AIResponse | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [historyItems, setHistoryItems] = useState<WorkStory[]>([]);

    // Story-Comment Linking State
    const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null);
    const [selectedCommentId, setSelectedCommentId] = useState<number | null>(null);
    const [comments, setComments] = useState<WorkStory[]>([]);

    // Modal State
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [editingStoryId, setEditingStoryId] = useState<number | null>(null);
    const [editingStoryTitle, setEditingStoryTitle] = useState("");

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // VAD Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const maxVolumeRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);

    const loadHistory = async () => {
        if (!window.electron?.db) return;
        try {
            const data = await window.electron.db.getWorkStories();
            setHistoryItems(data);
        } catch (err) {
            console.error("Failed to load history", err);
        }
    };

    const loadComments = async (storyId: number) => {
        if (!window.electron?.db) return;
        try {
            const data = await window.electron.db.getComments(storyId);
            setComments(data);
        } catch (err) {
            console.error("Failed to load comments", err);
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    useEffect(() => {
        if (selectedStoryId) {
            loadComments(selectedStoryId);
        } else {
            setComments([]);
        }
    }, [selectedStoryId]);

    useEffect(() => {
        if (isRecording) {
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } else if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [isRecording]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const toCompactTitle = (text: string) => {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (!normalized) return "Untitled Story";
        const max = 42;
        return normalized.length > max ? `${normalized.slice(0, max - 1).trim()}...` : normalized;
    };

    const buildStoryTitle = (overviewText: string, outputText: string, aiSummary?: string | null) => {
        if (aiSummary && aiSummary.trim()) return toCompactTitle(aiSummary);
        const firstLine = outputText.split('\n').find((line) => line.trim()) || "";
        if (firstLine) return toCompactTitle(firstLine.replace(/^#+\s*/, ""));
        return toCompactTitle(overviewText);
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

    const handleToggleRecording = async () => {
        if (!isRecording) {
            try {
                const electron = window.electron;
                const selectedMic = await electron?.settings?.get("selectedMic");
                const constraints = { audio: selectedMic ? { deviceId: { exact: selectedMic } } : true };
                const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
                setStream(mediaStream);

                // Start VAD
                startVAD(mediaStream);

                const options = { mimeType: 'audio/webm' };
                const recorder = new MediaRecorder(mediaStream, options);
                mediaRecorderRef.current = recorder;
                chunksRef.current = [];

                recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
                recorder.onstop = async () => {
                    stopVAD();
                    // Silence Check: If max volume was < 10 (out of 255), drop it.
                    if (maxVolumeRef.current < SILENCE_THRESHOLD) {
                        console.warn("Audio too quiet, dropping.");
                        window.electron?.settings?.sendStatus('warning', 'IGNORED (SILENCE)');
                        setStream(null);
                        mediaStream.getTracks().forEach(t => t.stop());
                        return;
                    }

                    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                    const arrayBuffer = await blob.arrayBuffer();
                    processAudio(arrayBuffer);
                    mediaStream.getTracks().forEach(t => t.stop());
                    setStream(null);
                };

                recorder.start(1000);
                setIsRecording(true);
                setRecordingTime(0);
                window.electron?.settings?.sendStatus('recording', 'Recording...');
            } catch (err) {
                console.error("Recording failed", err);
                window.electron?.settings?.sendStatus('error', 'Recording Failed');
            }
        } else {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
            window.electron?.settings?.sendStatus('processing', 'Processing...');
        }
    };

    const handleNewSession = () => {
        setOverview("");
        setSummary("");
        setJiraStory(null);
        setSelectedStoryId(null);
        setSelectedCommentId(null);
        setComments([]);
        setActiveTab('story');
    };

    const processAudio = async (arrayBuffer: ArrayBuffer) => {
        if (!window.electron?.ai) return;
        setIsProcessing(true);
        window.electron?.settings?.sendStatus('processing', 'Transcribing...');
        try {
            const transcript = await window.electron.ai.transcribe(arrayBuffer);
            if (!transcript || transcript.startsWith("Error")) {
                throw new Error(transcript || "Transcription failed");
            }
            setOverview(transcript);

            window.electron?.settings?.sendStatus('ready', 'Transcript Ready');
        } catch (err: unknown) {
            console.error("AI Processing failed", err);

            const msg = err instanceof Error ? err.message : 'AI Failed';
            if (msg.includes('API Key not found')) {
                window.electron?.settings?.sendStatus('error', 'NO API KEY');
            } else {
                window.electron?.settings?.sendStatus('error', 'AI FAILED');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleManualGenerate = async () => {
        if (!overview || !window.electron?.ai) return;
        setIsProcessing(true);
        window.electron?.settings?.sendStatus('processing', 'Generating...');
        try {
            if (activeTab === 'story') {
                // Returns { summary, description } where description is Markdown
                const insight = await window.electron.ai.generateStory(overview);
                setJiraStory(insight);
                setSummary(insight.description);
            } else {
                const polished = await window.electron.ai.polishComment(overview);
                setSummary(polished);
            }
            window.electron?.settings?.sendStatus('ready', 'Ready');
        } catch (err) {
            console.error("Manual generate failed", err);
            window.electron?.settings?.sendStatus('error', 'Generation Failed');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveStory = async () => {
        if (!summary || !window.electron?.db) return;
        try {
            const output = jiraStory ? jiraStory.description : summary;
            const storyTitle = buildStoryTitle(overview, output, jiraStory?.summary);

            // If saving a comment, we need a parent story
            if (activeTab === 'comment' && !selectedStoryId) {
                setAlertMessage("Cannot save comment: No story selected.");
                return;
            }

            await window.electron.db.saveWorkStory(
                activeTab,
                overview,
                output,
                activeTab === 'comment' && selectedStoryId ? selectedStoryId : undefined,
                activeTab === 'story' ? storyTitle : undefined
            );

            setAlertMessage(activeTab === 'story' ? "Story saved!" : "Comment saved!");

            if (activeTab === 'story') {
                loadHistory(); // Refresh stories list
                // Optionally auto-select the new story? For now, let's just refresh.
            } else {
                if (selectedStoryId) loadComments(selectedStoryId); // Refresh comments list
                setOverview(""); // Clear workspace after partial save
                setSummary("");
            }

        } catch (err) {
            console.error("Save failed", err);
        }
    };

    const handleExport = async () => {
        if (!summary) return;
        let content = summary;

        // If we have a selected story, try to append comments
        if (activeTab === 'story' && selectedStoryId && window.electron?.db) {
            try {
                const commentsList = await window.electron.db.getComments(selectedStoryId);
                if (commentsList && commentsList.length > 0) {
                    content += "\n\n---\n\n### Comments\n\n";
                    commentsList.forEach((c) => {
                        content += `**${c.created_at ? new Date(c.created_at).toLocaleString() : 'Unknown'}**\n\n${c.output}\n\n`;
                    });
                }
            } catch (err) {
                console.error("Failed to export comments for main view", err);
            }
        }

        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lazy_export_${new Date().toISOString().slice(0, 10)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExportItem = async (item: WorkStory, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item.output || !window.electron?.db) return;

        let content = item.output;

        // If it's a story, fetch and append comments
        if (item.type === 'story' && item.id) {
            try {
                const commentsList = await window.electron.db.getComments(item.id);
                if (commentsList && commentsList.length > 0) {
                    content += "\n\n---\n\n### Comments\n\n";
                    commentsList.forEach((c) => {
                        content += `**${c.created_at ? new Date(c.created_at).toLocaleString() : 'Unknown'}**\n\n${c.output}\n\n`;
                    });
                }
            } catch (err) {
                console.error("Failed to export comments", err);
            }
        }

        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${item.type}_export_${item.created_at ? new Date(item.created_at).toISOString().slice(0, 10) : 'unknown'}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleSelectItem = (item: WorkStory) => {
        // Since sidebar only shows stories now, we always switch to Story tab when clicking a sidebar item
        setActiveTab('story');
        setOverview(item.overview || "");
        setSelectedStoryId(item.id ?? null);
        setSelectedCommentId(null);

        const content = item.output || "";

        // Legacy 1: "SUMMARY: ... \n\n ..." format
        if (item.type === 'story' && content.startsWith('SUMMARY:')) {
            const parts = content.split('\n\n');
            const summaryPart = parts[0].replace('SUMMARY: ', '');
            const descriptionPart = parts.slice(1).join('\n\n');
            setJiraStory({ summary: summaryPart, description: descriptionPart });
            setSummary(descriptionPart);
            return;
        }

        // Legacy 2: JSON string format (old Jira output)
        if (content.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(content);
                if (parsed.summary && parsed.description) {
                    setJiraStory(parsed);
                    setSummary(parsed.description);
                    return;
                }
            } catch {
                // Not valid JSON, fall through
            }
        }

        // Default: Pure Markdown
        setJiraStory(null);
        setSummary(content);
    };

    const handleSelectComment = (comment: WorkStory) => {
        setActiveTab('comment');
        setSelectedCommentId(comment.id ?? null);
        setOverview(comment.overview || "");
        setSummary(comment.output || "");
        setJiraStory(null);
    };

    const handleAddCommentClick = () => {
        if (!selectedStoryId) return;
        setActiveTab('comment');
        setSelectedCommentId(null);
        setOverview("");
        setSummary("");
        setJiraStory(null);
    };

    const handleDeleteClick = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setPendingDeleteId(id);
    };

    const startEditingStoryTitle = (item: WorkStory, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item.id) return;
        setEditingStoryId(item.id);
        setEditingStoryTitle(item.title?.trim() || buildStoryTitle(item.overview || "", item.output || ""));
    };

    const cancelEditingStoryTitle = () => {
        setEditingStoryId(null);
        setEditingStoryTitle("");
    };

    const saveEditedStoryTitle = async (item: WorkStory, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!item.id || !window.electron?.db) return;
        const sanitized = toCompactTitle(editingStoryTitle);
        try {
            await window.electron.db.updateWorkStoryTitle(item.id, sanitized);
            setHistoryItems((prev) =>
                prev.map((story) => (story.id === item.id ? { ...story, title: sanitized } : story))
            );
        } catch (err) {
            console.error("Failed to update story title", err);
            setAlertMessage("Could not rename story.");
        } finally {
            cancelEditingStoryTitle();
        }
    };

    const confirmDelete = async () => {
        if (pendingDeleteId === null || !window.electron?.db) return;
        try {
            await window.electron.db.deleteItem('work_stories', pendingDeleteId);
            loadHistory();

            // If we have a selected story, refresh comments (in case we deleted a comment)
            if (selectedStoryId) {
                const refreshedComments = await window.electron.db.getComments(selectedStoryId);
                setComments(refreshedComments);
            }

            // If we deleted the selected story, clear selection
            if (pendingDeleteId === selectedStoryId) {
                setSelectedStoryId(null);
                setComments([]);
                setOverview("");
                setSummary("");
            }

            // If we deleted the selected comment, clear comment selection
            if (pendingDeleteId === selectedCommentId) {
                setSelectedCommentId(null);
                setOverview("");
                setSummary("");
                // But keep story selected
            }
        } catch (err) {
            console.error("Delete failed", err);
        } finally {
            setPendingDeleteId(null);
        }
    };

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

            <div className="flex-1 flex overflow-hidden p-1 gap-1">
                {/* --- LEFT: HISTORY --- */}
                <aside className="w-72 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                    <div className="flex h-8 items-center border-b border-border bg-muted/50 px-2 overflow-hidden">
                        <div className="relative w-full">
                            <Search
                                size={14}
                                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                            />
                            <input
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-6 w-full rounded-md border border-border bg-background/80 pl-8 pr-2 text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
                        {historyItems.length === 0 ? (
                            <div className="text-center py-6 opacity-30 italic text-sm text-muted-foreground">No history</div>
                        ) : historyItems
                            .filter(item => (item.overview || "").toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => handleSelectItem(item)}
                                    className={`group flex items-center justify-between p-1.5 rounded-md cursor-pointer transition-all border ${selectedStoryId === item.id
                                        ? "bg-primary/10 border-primary/25 shadow-sm"
                                        : "bg-background/80 border-border hover:bg-secondary/60"
                                        }`}
                                >
                                    <div className="flex flex-col min-w-0 mr-1.5">
                                        {editingStoryId === item.id ? (
                                            <div className="flex items-center gap-0.5">
                                                <input
                                                    autoFocus
                                                    value={editingStoryTitle}
                                                    onChange={(e) => setEditingStoryTitle(e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            void saveEditedStoryTitle(item);
                                                        } else if (e.key === "Escape") {
                                                            cancelEditingStoryTitle();
                                                        }
                                                    }}
                                                    className="h-5 w-full rounded border border-border bg-background px-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 p-0 shrink-0"
                                                    onClick={(e) => void saveEditedStoryTitle(item, e)}
                                                    title="Save title"
                                                >
                                                    <Check size={10} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 p-0 shrink-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        cancelEditingStoryTitle();
                                                    }}
                                                    title="Cancel"
                                                >
                                                    <X size={10} />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-0.5 min-w-0">
                                                <div className="font-medium text-[11px] leading-snug text-foreground truncate" title={item.title || item.overview || "Untitled Story"}>
                                                    {item.title || buildStoryTitle(item.overview || "", item.output || "")}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-4 w-4 p-0 shrink-0 opacity-70 hover:opacity-100"
                                                    onClick={(e) => startEditingStoryTitle(item, e)}
                                                    title="Rename"
                                                >
                                                    <Pencil size={9} />
                                                </Button>
                                            </div>
                                        )}
                                        <span className="text-[9px] leading-none text-muted-foreground">
                                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Unknown'}
                                        </span>
                                    </div>

                                    <div className="shrink-0 flex items-center overflow-hidden rounded-md border border-border bg-background/70">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 p-0 rounded-none border-0 bg-transparent hover:bg-secondary/70"
                                            onClick={(e) => handleExportItem(item, e)}
                                            title="Export"
                                        >
                                            <Download size={12} />
                                        </Button>
                                        <div className="h-7 w-px bg-border" />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 p-0 rounded-none border-0 bg-transparent text-destructive hover:bg-destructive/10"
                                            onClick={(e) => handleDeleteClick(item.id!, e)}
                                            title="Delete"
                                        >
                                            <Trash2 size={12} className="text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                    </div>
                </aside>

                {/* --- CENTER: WORKBENCH --- */}
                <main className="flex-1 flex flex-col gap-1 overflow-hidden">
                    <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                        <div className="relative flex h-8 items-center justify-center px-3 py-1 bg-muted/50 border-b border-border">
                            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
                                TRANSCRIPT
                            </h2>
                            <span className="absolute right-3 text-[9px] font-mono text-zinc-400 italic">
                                {(overview || "").split(/\s+/).filter(w => w).length} words
                            </span>
                        </div>

                        <textarea
                            className="flex-1 w-full p-2 bg-transparent resize-none focus:outline-none text-xs leading-relaxed text-foreground placeholder:text-muted-foreground overflow-y-auto"
                            placeholder="Describe your session..."
                            value={overview}
                            onChange={(e) => setOverview(e.target.value)}
                        />

                        {/* Controls */}
                        <div className="relative px-3 py-2 flex items-center justify-between bg-muted/20 border-t border-border mt-auto">
                            <div className="flex items-center">
                                <div className="flex items-center gap-1.5">
                                <Button
                                    variant={isRecording ? 'destructive' : 'primary'}
                                    size="sm"
                                    onClick={handleToggleRecording}
                                    className={`h-7 py-0 text-[10px] ${isRecording ? 'animate-pulse' : ''}`}
                                >
                                    <Mic size={12} className="mr-1" />
                                    {isRecording ? "Stop" : "Record"}
                                </Button>

                                {isRecording && (
                                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-background rounded border border-border shadow-inner h-7">
                                        <span className="text-[10px] font-mono text-foreground font-medium w-8 text-center">{formatTime(recordingTime)}</span>
                                        <Waveform stream={stream} className="w-16 h-4" />
                                    </div>
                                )}

                                {isProcessing && (
                                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-secondary/30 rounded h-7">
                                        <div className="w-1 h-1 bg-primary rounded-full animate-bounce" />
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">AI Processing...</span>
                                    </div>
                                )}
                                </div>

                                <button
                                    onClick={handleNewSession}
                                    className="absolute left-1/2 -translate-x-1/2 h-7 px-2 text-[10px] font-bold italic uppercase tracking-wider text-green-600 dark:text-green-400 underline underline-offset-2 hover:opacity-80 transition-opacity"
                                    title="Start New Session"
                                >
                                    New Session
                                </button>
                            </div>

                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleManualGenerate}
                                disabled={!overview || isProcessing}
                                className="text-[9px] h-7 px-3 font-bold uppercase tracking-wider"
                            >
                                Generate AI
                            </Button>
                        </div>
                    </div>

                    {/* Bottom: OUTPUT */}
                    <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                        <div className="relative flex h-8 items-center justify-center px-3 py-1 bg-muted/50 border-b border-border">
                            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">OUTPUT</h2>
                            <div className="absolute right-3 flex items-center gap-2">
                                {summary && (
                                    <div className="flex h-6 items-center overflow-hidden rounded-md bg-background/80 ring-1 ring-border">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 p-0 rounded-none border-0 bg-transparent hover:bg-secondary/70"
                                            onClick={() => {
                                                navigator.clipboard.writeText(summary);
                                                setAlertMessage("Copied!");
                                            }}
                                        >
                                            <Copy size={11} />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-2 overflow-y-auto bg-background/50 text-xs">
                            {summary ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-headings:text-base prose-li:my-1">
                                    <ReactMarkdown>{summary}</ReactMarkdown>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-[10px] text-center px-4 opacity-50">
                                    <p>Record audio or type, then click Generate.</p>
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="px-3 py-2 border-t border-border flex gap-1.5 bg-muted/20 mt-auto">
                            <Button
                                className="flex-1 text-[9px] h-7 font-bold uppercase tracking-wider"
                                size="sm"
                                onClick={handleSaveStory}
                                disabled={!summary || isProcessing}
                                isLoading={isProcessing}
                            >
                                {activeTab === 'story' ? 'Save Story' : 'Save Comment'}
                            </Button>
                            <Button
                                variant="outline"
                                className="flex-1 text-[9px] h-7 font-bold uppercase tracking-wider"
                                size="sm"
                                onClick={handleExport}
                                disabled={!summary}
                            >
                                Export
                            </Button>
                        </div>
                    </div>
                </main>

                {/* --- RIGHT: COMMENTS --- */}
                <aside className="w-72 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                    <div className="relative flex h-8 items-center justify-center px-3 py-1 bg-muted/50 border-b border-border">
                        <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Comments</h2>
                        <Button
                            variant={activeTab === 'comment' && !selectedCommentId ? 'primary' : 'ghost'}
                            size="icon"
                            className="absolute right-3 h-5 w-5"
                            onClick={handleAddCommentClick}
                            disabled={!selectedStoryId}
                            title={selectedStoryId ? "Add Comment" : "Select a story first"}
                        >
                            <Plus size={12} />
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
                        {comments.length === 0 ? (
                            <div className="text-center py-6 opacity-30 italic text-sm text-muted-foreground">
                                {!selectedStoryId ? "Select a story" : "No comments yet"}
                            </div>
                        ) : comments.map(comment => (
                            <div
                                key={comment.id}
                                onClick={() => handleSelectComment(comment)}
                                className={`group flex items-center justify-between p-1.5 rounded-md cursor-pointer transition-all border ${selectedCommentId === comment.id
                                    ? "bg-primary/10 border-primary/25 shadow-sm"
                                    : "bg-background/80 border-border hover:bg-secondary/60"
                                    }`}
                            >
                                    <div className="flex flex-col min-w-0 mr-1.5">
                                    <div className="font-medium text-[11px] leading-snug text-foreground truncate" title={comment.output || "Untitled"}>
                                        {(comment.output || "").slice(0, 35)}...
                                    </div>
                                    <span className="text-[9px] leading-none text-muted-foreground">
                                        {comment.created_at ? new Date(comment.created_at).toLocaleDateString() : 'Unknown'}
                                    </span>
                                </div>
                                <div className="shrink-0 flex items-center overflow-hidden rounded-md border border-border bg-background/70">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 p-0 rounded-none border-0 bg-transparent hover:bg-secondary/70"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(comment.output || "");
                                            setAlertMessage("Copied!");
                                        }}
                                    >
                                        <Copy size={12} />
                                    </Button>
                                    <div className="h-7 w-px bg-border" />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 p-0 rounded-none border-0 bg-transparent text-destructive hover:bg-destructive/10"
                                        onClick={(e) => handleDeleteClick(comment.id!, e)}
                                    >
                                        <Trash2 size={12} className="text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>
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
                title="Confirm Deletion"
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
                <p className="py-2 text-sm text-muted-foreground">Are you sure you want to permanently delete this item? This action cannot be undone.</p>
            </Modal>
        </div>
    );
}
