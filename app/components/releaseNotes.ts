export interface ReleaseNote {
    version: string;
    heading: string;
    why: string;
    items: string[];
}

const RELEASE_NOTES: ReleaseNote[] = [
    {
        version: "1.2.2",
        heading: "Safe Folder Deletion & UI Refinements",
        why: "We've added powerful folder management and polished the interface for a smoother, more intuitive experience.",
        items: [
            "🗑️ Safe Folder Deletion: You can now delete entire thread folders. Don't worry—all meetings inside are safely 'un-grouped' and moved to Standalone, so no data is ever lost.",
            "🎨 UI Polish: Refined the sidebar with compact spacing, clarified session labels ('CLEAR/NEW SESSION'), and introduced a permanent red Trash icon for folders.",
            "📂 Fluid Threads: Related meetings now group into folders that 'fall' into view with a smooth fallback animation.",
            "📑 Meeting Templates: Select between Standard, Stand-Up, Action Items, or Decision Log to get perfectly structured AI summaries.",
            "✨ Unified Design: The Meeting and Tracker pages now share identical premium header sizing, offsets, and typography."
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
