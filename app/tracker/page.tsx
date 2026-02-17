"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    ChevronLeft, Search, Mic, Play, Pause, Square,
    Wand2, Save, FileOutput, Plus, Trash2, Calendar,
    FileText, Activity, Copy, RotateCcw, Download
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import Waveform from "../components/Waveform";
import Modal from "../components/Modal";

export default function TrackerPage() {
    const router = useRouter();

    // State
    const [activeTab, setActiveTab] = useState<'story' | 'comment'>('story');
    const [overview, setOverview] = useState("");
    const [summary, setSummary] = useState("");
    const [jiraStory, setJiraStory] = useState<{ summary: string; description: string } | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [historyItems, setHistoryItems] = useState<any[]>([]);

    const [audioBuffer, setAudioBuffer] = useState<ArrayBuffer | null>(null);

    // Story-Comment Linking State
    const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null);
    const [selectedCommentId, setSelectedCommentId] = useState<number | null>(null);
    const [comments, setComments] = useState<any[]>([]);

    // Modal State
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // VAD Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const maxVolumeRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);

    const loadHistory = async () => {
        if (!(window as any).electron?.db) return;
        try {
            const data = await (window as any).electron.db.getWorkStories();
            setHistoryItems(data);
        } catch (err) {
            console.error("Failed to load history", err);
        }
    };

    const loadComments = async (storyId: number) => {
        if (!(window as any).electron?.db) return;
        try {
            const data = await (window as any).electron.db.getComments(storyId);
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
            try {
                const electron = (window as any).electron;
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
                    mediaStream.getTracks().forEach(t => t.stop());
                    setStream(null);
                };

                recorder.start(1000);
                setIsRecording(true);
                setRecordingTime(0);
                (window as any).electron?.settings?.sendStatus('recording', 'Recording...');
            } catch (err) {
                console.error("Recording failed", err);
                (window as any).electron?.settings?.sendStatus('error', 'Recording Failed');
            }
        } else {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
            (window as any).electron?.settings?.sendStatus('processing', 'Processing...');
        }
    };

    const processAudio = async (arrayBuffer: ArrayBuffer) => {
        if (!(window as any).electron?.ai) return;
        setIsProcessing(true);
        (window as any).electron?.settings?.sendStatus('processing', 'Transcribing...');
        try {
            const transcript = await (window as any).electron.ai.transcribe(arrayBuffer);
            if (!transcript || transcript.startsWith("Error")) {
                throw new Error(transcript || "Transcription failed");
            }
            setOverview(transcript);

            (window as any).electron?.settings?.sendStatus('ready', 'Transcript Ready');
        } catch (err: any) {
            console.error("AI Processing failed", err);

            const msg = err.message || 'AI Failed';
            if (msg.includes('API Key not found')) {
                (window as any).electron?.settings?.sendStatus('error', 'NO API KEY');
            } else {
                (window as any).electron?.settings?.sendStatus('error', 'AI FAILED');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleManualGenerate = async () => {
        if (!overview || !(window as any).electron?.ai) return;
        setIsProcessing(true);
        (window as any).electron?.settings?.sendStatus('processing', 'Generating...');
        try {
            if (activeTab === 'story') {
                // Returns { summary, description } where description is Markdown
                const insight = await (window as any).electron.ai.generateStory(overview);
                setJiraStory(insight);
                setSummary(insight.description);
            } else {
                const polished = await (window as any).electron.ai.polishComment(overview);
                setSummary(polished);
            }
            (window as any).electron?.settings?.sendStatus('ready', 'Ready');
        } catch (err) {
            console.error("Manual generate failed", err);
            (window as any).electron?.settings?.sendStatus('error', 'Generation Failed');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveStory = async () => {
        if (!summary || !(window as any).electron?.db) return;
        try {
            const output = jiraStory ? `SUMMARY: ${jiraStory.summary}\n\n${jiraStory.description}` : summary;

            // If saving a comment, we need a parent story
            if (activeTab === 'comment' && !selectedStoryId) {
                setAlertMessage("Cannot save comment: No story selected.");
                return;
            }

            await (window as any).electron.db.saveWorkStory(
                activeTab,
                overview,
                output,
                activeTab === 'comment' ? selectedStoryId : null
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
        if (activeTab === 'story' && selectedStoryId) {
            try {
                const comments = await (window as any).electron.db.getComments(selectedStoryId);
                if (comments && comments.length > 0) {
                    content += "\n\n---\n\n### Comments\n\n";
                    comments.forEach((c: any) => {
                        content += `**${new Date(c.created_at).toLocaleString()}**\n\n${c.output}\n\n`;
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

    const handleExportItem = async (item: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item.output) return;

        let content = item.output;

        // If it's a story, fetch and append comments
        if (item.type === 'story') {
            try {
                const comments = await (window as any).electron.db.getComments(item.id);
                if (comments && comments.length > 0) {
                    content += "\n\n---\n\n### Comments\n\n";
                    comments.forEach((c: any) => {
                        content += `**${new Date(c.created_at).toLocaleString()}**\n\n${c.output}\n\n`;
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
        a.download = `${item.type}_export_${new Date(item.created_at).toISOString().slice(0, 10)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleCopyComment = (text: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setAlertMessage("Comment copied to clipboard!");
        setTimeout(() => setAlertMessage(null), 2000);
    };

    const handleSelectItem = (item: any) => {
        // Since sidebar only shows stories now, we always switch to Story tab when clicking a sidebar item
        setActiveTab('story');
        setOverview(item.overview);
        setSelectedStoryId(item.id);
        setSelectedCommentId(null);

        let content = item.output;

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
            } catch (e) {
                // Not valid JSON, fall through
            }
        }

        // Default: Pure Markdown
        setJiraStory(null);
        setSummary(content);
    };

    const handleSelectComment = (comment: any) => {
        setActiveTab('comment');
        setSelectedCommentId(comment.id);
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

    const confirmDelete = async () => {
        if (pendingDeleteId === null) return;
        try {
            await (window as any).electron.db.deleteItem('work_stories', pendingDeleteId);
            loadHistory();

            // If we have a selected story, refresh comments (in case we deleted a comment)
            if (selectedStoryId) {
                const refreshedComments = await (window as any).electron.db.getComments(selectedStoryId);
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
        <div className="flex h-screen flex-col bg-background text-foreground font-sans overflow-hidden">

            {/* --- TOP BRAND BAR --- */}
            <div className="flex items-center justify-center pt-0 pb-0 -mt-2">
                <button
                    onClick={() => router.push('/')}
                    className="transition-opacity focus:outline-none cursor-pointer p-0 m-0 border-none bg-transparent"
                    title="Go Home"
                >
                    <img
                        src="/logo.png"
                        alt="LAZY Logo"
                        className="h-28 w-auto object-contain dark:filter dark:grayscale dark:brightness-0 dark:invert-[1]"
                    />
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden p-4 pb-8 gap-4">
                {/* --- SIDEBAR: HISTORY --- */}
                <aside className="w-[280px] flex flex-col">
                    <div className="flex-1 border border-border p-0.5 rounded-lg bg-card/10">
                        <div className="h-full flex flex-col border border-border rounded-md bg-card overflow-hidden">
                            <div className="px-4 py-2 border-b border-border bg-muted/50">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                    <input
                                        type="text"
                                        placeholder="Search stories..."
                                        className="w-full bg-secondary border-2 border-input rounded-md py-2 pl-9 pr-3 text-sm focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                {historyItems.length === 0 ? (
                                    <div className="text-center py-10 opacity-30 italic text-sm text-muted-foreground">No history yet</div>
                                ) : historyItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleSelectItem(item)}
                                        className={`group flex items-center justify-between p-3 border-b border-border/60 cursor-pointer transition-all last:border-0 ${selectedStoryId === item.id
                                            ? "bg-secondary border-primary/20 shadow-sm"
                                            : "hover:bg-secondary/50 border-transparent hover:border-border"
                                            }`}
                                    >
                                        <div className="flex flex-col min-w-0 mr-3">
                                            <div className="font-medium text-xs text-foreground truncate" title={item.overview}>
                                                {item.overview.slice(0, 40)}...
                                            </div>
                                            <span className="text-[10px] text-muted-foreground">
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1 transition-opacity">
                                            <button
                                                onClick={(e) => handleExportItem(item, e)}
                                                className="relative z-10 flex items-center justify-center h-6 w-6 rounded-md border border-border text-muted-foreground hover:text-primary hover:bg-secondary hover:border-primary transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                                                title="Export Story"
                                            >
                                                <Download size={13} />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteClick(item.id, e)}
                                                className="relative z-10 flex items-center justify-center h-6 w-6 rounded-md border border-border text-destructive/80 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-destructive"
                                                title="Delete Story"
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

                {/* --- CENTER: WORKBENCH (Shared 50/50) --- */}
                <main className="flex-1 flex flex-col min-w-0 bg-background/50 gap-4 overflow-hidden">

                    {/* Top: Workbench with Double Border */}
                    <div className="flex-1 min-h-0 border border-border p-0.5 rounded-lg bg-card/10">
                        <section className="h-full flex flex-col border border-border rounded-md bg-card overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/50">
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                    {activeTab === 'story' ? 'Transcript' : 'Comment Transcript'}
                                </h2>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => {
                                            // Reset session but keep selection context if meant for new story?
                                            // Or is "New Session" meant to clear everything including selection?
                                            // Let's assume it clears text but keeps selection if we are commenting.
                                            // Actually, usually "New Session" implies starting a new Story.
                                            setActiveTab('story');
                                            setSelectedStoryId(null);
                                            setComments([]);
                                            setOverview("");
                                            setSummary("");
                                            setJiraStory(null);
                                        }}
                                        className="text-[10px] text-primary underline hover:text-primary/80 transition-all cursor-pointer active:scale-95"
                                    >
                                        New Session
                                    </button>
                                    <span className="text-xs text-zinc-400 font-mono">
                                        {(overview || "").split(/\s+/).filter(w => w).length} words
                                    </span>
                                </div>
                            </div>

                            <textarea
                                className="flex-1 w-full p-6 bg-transparent resize-none focus:outline-none text-base leading-relaxed text-foreground placeholder:text-muted-foreground overflow-y-auto"
                                placeholder={activeTab === 'story' ? "Describe your work session..." : "Record your comment..."}
                                value={overview}
                                onChange={(e) => setOverview(e.target.value)}
                            />

                            {/* Controls */}
                            <div className="px-6 py-4 flex items-center justify-between bg-card border-t border-border mt-auto">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleToggleRecording}
                                        className={`flex items-center justify-center px-4 py-2 rounded-md text-sm font-semibold shadow-sm transition-all focus:outline-none cursor-pointer active:scale-95 ${isRecording
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
                                            <span className="text-xs font-medium text-muted-foreground mr-1">AI Processing...</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleManualGenerate}
                                        disabled={!overview || isProcessing}
                                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-all shadow-sm disabled:opacity-50 cursor-pointer active:scale-95 disabled:cursor-not-allowed"
                                    >
                                        <span className="text-indigo-100 font-medium mr-1">Generate AI</span>
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Bottom: OUTPUT (Shared 50/50) */}
                    <div className="flex-1 min-h-0 border border-border p-0.5 rounded-lg bg-card/10">
                        <section className="h-full flex flex-col bg-background border border-border rounded-md shadow-inner overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-2 border-b border-border bg-muted/50">
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                    OUTPUT
                                </h2>
                            </div>
                            <div className="flex-1 p-6 overflow-y-auto">
                                {summary ? (
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                        <ReactMarkdown>{summary}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm text-center px-8 opacity-50">
                                        <p>Record audio to generate a summary.</p>
                                    </div>
                                )}
                            </div>

                            {/* Footer Actions (Refined) */}
                            <div className="px-4 py-2 border-t border-border flex gap-6 bg-card mt-auto">
                                <button
                                    onClick={handleSaveStory}
                                    disabled={!summary}
                                    className="flex-1 flex items-center justify-center py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-all shadow-sm disabled:opacity-50 cursor-pointer active:scale-95 disabled:cursor-not-allowed"
                                >
                                    {activeTab === 'story' ? 'Save Story' : 'Save Comment'}
                                </button>
                                <button
                                    onClick={handleExport}
                                    disabled={!summary}
                                    className="flex-1 flex items-center justify-center py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-all shadow-sm disabled:opacity-50 cursor-pointer active:scale-95 disabled:cursor-not-allowed"
                                >
                                    Export (.md)
                                </button>
                            </div>
                        </section>
                    </div>
                </main>

                {/* --- RIGHT SIDEBAR: COMMENTS with Double Border --- */}
                <aside className="w-[280px] flex flex-col">
                    <div className="flex-1 border border-border p-0.5 rounded-lg bg-card/10">
                        <div className="h-full flex flex-col bg-card border border-border rounded-md overflow-hidden">
                            <div className="px-6 py-3 border-b border-border flex items-center justify-between bg-muted/50">
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Comments</h2>
                                <button
                                    onClick={handleAddCommentClick}
                                    disabled={!selectedStoryId}
                                    className={`p-1.5 rounded-md border transition-colors cursor-pointer active:scale-90 shadow-sm ${selectedStoryId
                                        ? (activeTab === 'comment' ? 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-400 dark:border-indigo-800' : 'bg-white dark:bg-zinc-950 border-zinc-400 dark:border-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300')
                                        : 'opacity-40 cursor-not-allowed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/30'
                                        }`}
                                    title={selectedStoryId ? "Add Comment" : "Select a story first"}
                                >
                                    <Plus size={16} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                                {comments.length === 0 ? (
                                    <div className="text-center py-10 opacity-30 italic text-sm text-muted-foreground">
                                        {!selectedStoryId ? "Select a story to view comments" : "No comments yet"}
                                    </div>
                                ) : comments.map(comment => (
                                    <div
                                        key={comment.id}
                                        onClick={() => handleSelectComment(comment)}
                                        className={`group flex items-center justify-between p-3 border-b border-border/60 cursor-pointer transition-all last:border-0 ${selectedCommentId === comment.id
                                            ? "bg-secondary border-primary/20 shadow-sm"
                                            : "hover:bg-secondary/50 border-transparent hover:border-border"
                                            }`}
                                    >
                                        <div className="flex flex-col min-w-0 mr-3">
                                            <div className="font-medium text-xs text-foreground truncate" title={comment.output}>
                                                {comment.output.slice(0, 50)}...
                                            </div>
                                            <span className="text-[10px] text-muted-foreground">
                                                {new Date(comment.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 transition-opacity">
                                            <button
                                                onClick={(e) => handleCopyComment(comment.output, e)}
                                                className="relative z-10 flex items-center justify-center h-6 w-6 rounded-md border border-border text-muted-foreground hover:text-primary hover:bg-secondary hover:border-primary transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                                                title="Copy Comment"
                                            >
                                                <Copy size={13} />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteClick(comment.id, e)}
                                                className="relative z-10 flex items-center justify-center h-6 w-6 rounded-md border border-border text-destructive/80 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-destructive"
                                                title="Delete Comment"
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

            </div>

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
                    title="Confirm Deletion"
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
                    <p>Are you sure you want to permanently delete this item?</p>
                </Modal>
            )}
        </div>
    );
}
