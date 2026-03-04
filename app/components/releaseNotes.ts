export interface ReleaseNote {
    version: string;
    heading: string;
    why: string;
    items: string[];
}

const RELEASE_NOTES: ReleaseNote[] = [
    {
        version: "1.2.9",
        heading: "LAN discovery now broadcasts across active network paths",
        why: "Some local networks were not returning peers even when both apps were healthy. Discovery now uses broader broadcast targeting and clearer diagnostics.",
        items: [
            "LAN peer discovery now broadcasts to global and interface-specific broadcast paths.",
            "Added diagnostics for broadcast path count so scan routing is visible.",
            "Improved reliability when both devices are on the same LAN but default broadcast is filtered."
        ]
    },
    {
        version: "1.2.8",
        heading: "Team scan reliability and diagnostics have been strengthened",
        why: "Pairing issues were hard to diagnose on some machines. This update adds stronger socket handling and clearer status for local team sharing.",
        items: [
            "Scan now attempts UDP rebind automatically if discovery is not bound.",
            "Added UDP error visibility in LAN diagnostics for faster troubleshooting.",
            "Added LAN diagnostics panel and scan status feedback in Settings > My Team."
        ]
    },
    {
        version: "1.2.7",
        heading: "My Team now includes built-in LAN troubleshooting",
        why: "You need immediate visibility into why peer discovery works or fails without external debugging tools.",
        items: [
            "Added LAN diagnostics metrics: UDP/TCP state, peers seen, last broadcast, profile readiness.",
            "Added manual diagnostics refresh and clearer scan status feedback.",
            "Improved team sharing UX in Settings with scan and pairing context."
        ]
    },
    {
        version: "1.2.6",
        heading: "Scan flow is safer across mixed app versions",
        why: "Some users hit runtime errors when renderer and preload APIs were out of sync.",
        items: [
            "Added compatibility guard so scan no longer crashes when older runtime APIs are loaded.",
            "Improved status messaging to guide restart/update when API mismatch is detected."
        ]
    },
    {
        version: "1.2.5",
        heading: "LAN scan now performs active discovery",
        why: "Scan previously looked passive on some systems. It now performs active broadcast/refresh cycles with visible feedback.",
        items: [
            "Scan now actively broadcasts and waits for peer responses before presenting results.",
            "Added explicit scan progress and completion status messaging."
        ]
    },
    {
        version: "1.2.4",
        heading: "Local team sharing launched for meetings and stories",
        why: "You can now move work between Lazy installs without account sign-in using local team/device trust.",
        items: [
            "Added My Team device records with pairing code, fingerprint, and trust mode.",
            "Added LAN send flow for meetings and stories with direct import into destination app.",
            "Added .lazyshare export/import fallback for offline handoff."
        ]
    },
    {
        version: "1.2.3",
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
        heading: "Version update installed",
        why: "This release includes targeted improvements and fixes for stability and usability.",
        items: [
            "Bug fixes and reliability improvements across core flows.",
            "UI refinements and quality updates."
        ]
    };
}
