export interface ReleaseNote {
    version: string;
    heading: string;
    why: string;
    items: string[];
}

const RELEASE_NOTES: ReleaseNote[] = [
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
        heading: "Long meetings are now safer and more reliable",
        why: "Some long sessions could fail at the end and return nothing. This update protects captured content and reduces full-session loss risk.",
        items: [
            "Meeting recordings are transcribed in chunks instead of one large upload.",
            "If one chunk fails, successful chunks are still kept so transcript recovery is partial, not all-or-nothing.",
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
