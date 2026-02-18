import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Search, Mic, Save, Plus, Trash2, Copy, Download
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import Waveform from "../components/Waveform";
import Modal from "../components/Modal";
import Button from "../components/Button";
import { SearchInput } from "../components/Input";
import { WorkStory, AIResponse } from "../../main/types";

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
        } catch (err: any) {
            console.error("AI Processing failed", err);

            const msg = (err.message as string) || 'AI Failed';
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
            const output = jiraStory ? `SUMMARY: ${jiraStory.summary}\n\n${jiraStory.description}` : summary;

            // If saving a comment, we need a parent story
            if (activeTab === 'comment' && !selectedStoryId) {
                setAlertMessage("Cannot save comment: No story selected.");
                return;
            }

            await window.electron.db.saveWorkStory(
                activeTab,
                overview,
                output,
                activeTab === 'comment' && selectedStoryId ? selectedStoryId : undefined
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

    const handleCopyComment = (text: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setAlertMessage("Comment copied to clipboard!");
        setTimeout(() => setAlertMessage(null), 2000);
    };

    const handleSelectItem = (item: WorkStory) => {
        // Since sidebar only shows stories now, we always switch to Story tab when clicking a sidebar item
        setActiveTab('story');
        setOverview(item.overview);
        setSelectedStoryId(item.id ?? null);
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

            <div className="flex-1 flex overflow-hidden p-4 gap-4">
                {/* --- SIDEBAR: HISTORY --- */}
                <aside className="w-80 flex flex-col gap-4">
                    <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-border flex flex-col gap-4 bg-muted/30">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">History</h2>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleNewSession}
                                    title="New Session"
                                >
                                    <Plus size={18} />
                                </Button>
                            </div>
                            <SearchInput
                                placeholder="Search sessions..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {historyItems.length === 0 ? (
                                <div className="text-center py-10 opacity-30 italic text-sm text-muted-foreground">No history yet</div>
                            ) : historyItems
                                .filter(item => item.overview.toLowerCase().includes(searchQuery.toLowerCase()))
                                .map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleSelectItem(item)}
                                        className={`group flex items-center justify-between p-3 rounded-md cursor-pointer transition-all ${selectedStoryId === item.id
                                            ? "bg-primary/10 border border-primary/20 shadow-sm"
                                            : "hover:bg-secondary border border-transparent"
                                            }`}
                                    >
                                        <div className="flex flex-col min-w-0 mr-3">
                                            <div className="font-semibold text-xs text-foreground truncate" title={item.overview}>
                                                {item.overview || "Untitled Session"}
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

                {/* --- CENTER: WORKBENCH --- */}
                <main className="flex-1 flex flex-col gap-4 overflow-hidden">
                    <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/50">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                {activeTab === 'story' ? 'Transcript' : 'Comment Transcript'}
                                <span className="ml-2 text-[10px] font-mono text-zinc-400">
                                    {(overview || "").split(/\s+/).filter(w => w).length} words
                                </span>
                            </h2>
                            <div className="flex items-center gap-2">
                                {selectedStoryId && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleNewSession}
                                        className="text-xs h-7"
                                    >
                                        New
                                    </Button>
                                )}
                            </div>
                        </div>

                        <textarea
                            className="flex-1 w-full p-6 bg-transparent resize-none focus:outline-none text-base leading-relaxed text-foreground placeholder:text-muted-foreground overflow-y-auto"
                            placeholder={activeTab === 'story' ? "Describe your work session..." : "Record your comment..."}
                            value={overview}
                            onChange={(e) => setOverview(e.target.value)}
                        />

                        {/* Controls */}
                        <div className="px-6 py-4 flex items-center justify-between bg-muted/20 border-t border-border mt-auto">
                            <div className="flex items-center gap-3">
                                <Button
                                    variant={isRecording ? 'destructive' : 'primary'}
                                    onClick={handleToggleRecording}
                                    className={isRecording ? 'animate-pulse' : ''}
                                >
                                    <Mic size={16} className="mr-2" />
                                    {isRecording ? "Stop" : "Record"}
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

                            <Button
                                variant="secondary"
                                onClick={handleManualGenerate}
                                disabled={!overview || isProcessing}
                            >
                                Generate AI
                            </Button>
                        </div>
                    </div>

                    {/* Bottom: OUTPUT */}
                    <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-6 py-2 border-b border-border bg-muted/50">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OUTPUT</h2>
                            <div className="flex items-center gap-2">
                                {summary && (
                                    <>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => {
                                                navigator.clipboard.writeText(summary);
                                                setAlertMessage("Copied to clipboard!");
                                            }}
                                        >
                                            <Copy size={16} />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 p-6 overflow-y-auto bg-background/50">
                            {summary ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown>{summary}</ReactMarkdown>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm text-center px-8 opacity-50">
                                    <p>Record audio or type above, then click Generate.</p>
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="px-6 py-4 border-t border-border flex gap-4 bg-muted/20 mt-auto">
                            <Button
                                className="flex-1"
                                onClick={handleSaveStory}
                                disabled={!summary || isProcessing}
                                isLoading={isProcessing}
                            >
                                {activeTab === 'story' ? 'Save Story' : 'Save Comment'}
                            </Button>
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={handleExport}
                                disabled={!summary}
                            >
                                <Download size={16} className="mr-2" />
                                Export (.md)
                            </Button>
                        </div>
                    </div>
                </main>

                {/* --- RIGHT SIDEBAR: COMMENTS --- */}
                <aside className="w-80 flex flex-col gap-4">
                    <div className="flex-1 flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Comments</h2>
                            <Button
                                variant={activeTab === 'comment' && !selectedCommentId ? 'primary' : 'ghost'}
                                size="icon"
                                onClick={handleAddCommentClick}
                                disabled={!selectedStoryId}
                                title={selectedStoryId ? "Add Comment" : "Select a story first"}
                            >
                                <Plus size={18} />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {comments.length === 0 ? (
                                <div className="text-center py-10 opacity-30 italic text-sm text-muted-foreground">
                                    {!selectedStoryId ? "Select a story to view comments" : "No comments yet"}
                                </div>
                            ) : comments.map(comment => (
                                <div
                                    key={comment.id}
                                    onClick={() => handleSelectComment(comment)}
                                    className={`group flex items-center justify-between p-3 rounded-md cursor-pointer transition-all ${selectedCommentId === comment.id
                                        ? "bg-primary/10 border border-primary/20 shadow-sm"
                                        : "hover:bg-secondary border border-transparent"
                                        }`}
                                >
                                    <div className="flex flex-col min-w-0 mr-3">
                                        <div className="font-semibold text-xs text-foreground truncate" title={comment.output}>
                                            {comment.output.slice(0, 50)}...
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">
                                            {comment.created_at ? new Date(comment.created_at).toLocaleDateString() : 'Unknown'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(comment.output);
                                                setAlertMessage("Comment copied!");
                                            }}
                                        >
                                            <Copy size={13} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                            onClick={(e) => handleDeleteClick(comment.id!, e)}
                                        >
                                            <Trash2 size={13} />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            </div>

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
                title="Confirm Deletion"
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
                <p className="py-4">Are you sure you want to permanently delete this item? This action cannot be undone.</p>
            </Modal>
        </div>
    );
}
