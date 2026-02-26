"use client";

import { useEffect, useState } from "react";
import Button from "./Button";
import Modal from "./Modal";
import { getReleaseNote, ReleaseNote } from "./releaseNotes";

export default function ReleaseNotesModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [note, setNote] = useState<ReleaseNote | null>(null);

    useEffect(() => {
        let isCancelled = false;

        const hydrate = async () => {
            const settings = window.electron?.settings;
            if (!settings) return;

            try {
                const currentVersion = await settings.getVersion();
                if (!currentVersion || isCancelled) return;

                const [seenVersion, lastRunVersion, pendingReleaseNotesVersion] = await Promise.all([
                    settings.get("releaseNotesSeenVersion"),
                    settings.get("lastRunVersion"),
                    settings.get("pendingReleaseNotesVersion"),
                ]);

                const [apiKey, selectedMic] = await Promise.all([
                    settings.getApiKey().catch(() => ""),
                    settings.get("selectedMic").catch(() => ""),
                ]);

                let hasSavedContent = false;
                if (window.electron?.db) {
                    const [meetings, stories] = await Promise.all([
                        window.electron.db.getMeetings().catch(() => []),
                        window.electron.db.getWorkStories().catch(() => []),
                    ]);
                    hasSavedContent = meetings.length > 0 || stories.length > 0;
                }

                const likelyExistingUser =
                    !!apiKey || !!selectedMic || hasSavedContent;

                const updatedFromPreviousRun = !!lastRunVersion && lastRunVersion !== currentVersion;
                const pendingForThisVersion =
                    !!pendingReleaseNotesVersion && pendingReleaseNotesVersion === currentVersion;

                // Migration path:
                // pre-release-note builds won't have lastRunVersion/pendingReleaseNotesVersion keys.
                // If the profile has prior usage, show notes once instead of silently marking seen.
                if (!lastRunVersion && !pendingForThisVersion) {
                    settings.set("lastRunVersion", currentVersion);

                    if (likelyExistingUser && seenVersion !== currentVersion && !isCancelled) {
                        setNote(getReleaseNote(currentVersion));
                        setIsOpen(true);
                        return;
                    }

                    // Fresh profile: initialize silently.
                    settings.set("releaseNotesSeenVersion", currentVersion);
                    return;
                }

                const shouldShow =
                    (pendingForThisVersion || updatedFromPreviousRun) &&
                    seenVersion !== currentVersion;

                settings.set("lastRunVersion", currentVersion);

                if (shouldShow && !isCancelled) {
                    setNote(getReleaseNote(currentVersion));
                    setIsOpen(true);
                } else if (pendingForThisVersion && seenVersion === currentVersion) {
                    settings.set("pendingReleaseNotesVersion", "");
                }
            } catch (error) {
                console.error("Release notes check failed", error);
            }
        };

        void hydrate();
        return () => {
            isCancelled = true;
        };
    }, []);

    const handleClose = () => {
        const settings = window.electron?.settings;
        if (note?.version && settings) {
            settings.set("releaseNotesSeenVersion", note.version);
            settings.set("pendingReleaseNotesVersion", "");
        }
        setIsOpen(false);
    };

    if (!note) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={`What's New - v${note.version}`}
            footer={
                <Button onClick={handleClose} size="sm">
                    Continue
                </Button>
            }
        >
            <div className="space-y-3">
                <div>
                    <p className="text-sm font-semibold text-foreground">{note.heading}</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{note.why}</p>
                </div>
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Included in this version</p>
                    <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-foreground">
                        {note.items.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </Modal>
    );
}
