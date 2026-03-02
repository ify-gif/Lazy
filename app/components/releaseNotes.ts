export interface ReleaseNote {
    version: string;
    heading: string;
    why: string;
    items: string[];
}

const RELEASE_NOTES: ReleaseNote[] = [
    {
        version: "1.2.1",
        heading: "Meeting Threads, Dynamic Templates & Tracker Parity",
        why: "Huge update! You can now organize your meetings into multi-session threads and format the AI summaries directly in the app. Plus, the Meeting UI has been upgraded to match the premium Tracker experience side-by-side.",
        items: [
            "📂 Threaded History: Group related meetings together. Click a thread folder to watch past sessions smoothly 'fall' into view.",
            "📑 Meeting Templates: Choose between Standard, Stand-Up, Action Items, or Decision Log before hitting Generate. The AI will output exactly the structure you strictly need.",
            "✨ UI Parity: The Meeting page now perfectly mirrors the Tracker aesthetic. Same premium header sizing, offsets, spacing, and button layouts.",
            "🖱️ Context Menus: Right-click (or use the 3-dot menu) on any meeting in your history to change its thread, export it, or cleanly delete it.",
            "📰 On-Demand Release Notes: Re-read these updates anytime! We added a new 'Release Notes' button directly into the System Settings."
        ]
    },
    {
        version: "1.0.19",
        heading: "Long meeting transcription recovery is now automatic",
        why: "Some long recordings could fail on upload size. This update retries automatically so long sessions are recoverable.",
        items: [
            "Removed fragile per-chunk upload flow and restored single-pass transcription for normal sessions.",
            "If upload size is too large, transcription now auto-splits the audio into smaller halves and retries automatically.",
            "Results from split retries are merged back in order so you keep one full transcript."
        ]
    },
    {
        version: "1.0.16",
        heading: "One-time update notes are now built in",
        why: "Users should know what changed after an update, without searching release pages manually.",
        items: [
            "After app update and restart, LAZY now shows a one-time 'What's New' modal.",
            "The modal is styled with your existing theme modal system and appears across all app modes.",
            "Release notes are tracked per installed version so the same note is not shown repeatedly."
        ]
    },
    {
        version: "1.0.15",
        heading: "Long meetings use a single reliable transcription flow",
        why: "Chunk-level failures were causing partial or broken results. This update returns to a single-pass transcription path with recording limits tuned for long sessions.",
        items: [
            "Meeting recordings are transcribed as one continuous file instead of per-chunk uploads.",
            "Recording now auto-stops at 90 minutes to keep end-to-end transcription within safe bounds.",
            "Transcription errors now include clearer API details to speed up troubleshooting."
        ]
    }
];

export function getReleaseNote(version: string): ReleaseNote {
    const note = RELEASE_NOTES.find((entry) => entry.version === version);
    if (note) return note;

    return {
        version,
        heading: "App update installed",
        why: "This version includes stability, quality, and usability improvements.",
        items: [
            "General performance and reliability improvements.",
            "User experience refinements and bug fixes."
        ]
    };
}
