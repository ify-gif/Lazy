"use client";

import { useEffect, useState } from "react";
import Button from "./Button";
import Modal from "./Modal";
import { getReleaseNote, ReleaseNote } from "./releaseNotes";

const SEEN_VERSION_KEY = "lazy_release_notes_seen_version";

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

                const seenVersion = localStorage.getItem(SEEN_VERSION_KEY);

                // First run on this machine: initialize without interrupting user flow.
                if (!seenVersion) {
                    localStorage.setItem(SEEN_VERSION_KEY, currentVersion);
                    return;
                }

                if (seenVersion === currentVersion) return;

                if (!isCancelled) {
                    setNote(getReleaseNote(currentVersion));
                    setIsOpen(true);
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
        if (note?.version) {
            localStorage.setItem(SEEN_VERSION_KEY, note.version);
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
