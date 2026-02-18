"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import Button from "./Button";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted || !isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Click outside to close could be added here to the overlay div if desired, but blocking is safer for confirm */}
            <div className="w-[400px] max-w-[90vw] bg-card border border-border rounded-lg shadow-xl animate-in zoom-in-95 duration-200 flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground h-8 w-8"
                    >
                        <X size={18} />
                    </Button>
                </div>

                {/* Body */}
                <div className="p-6 text-foreground text-sm leading-relaxed">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="px-6 py-4 bg-muted/30 border-t border-border flex justify-end gap-3 rounded-b-lg">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
