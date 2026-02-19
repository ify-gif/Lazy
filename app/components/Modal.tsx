"use client";

import { X } from "lucide-react";
import Button from "./Button";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Click outside to close could be added here to the overlay div if desired, but blocking is safer for confirm */}
            <div className="w-[320px] max-w-[88vw] bg-card border border-border rounded-md shadow-xl animate-in zoom-in-95 duration-200 flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <h2 className="text-xl font-semibold text-foreground leading-none">{title}</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground h-7 w-7"
                    >
                        <X size={16} />
                    </Button>
                </div>

                {/* Body */}
                <div className="px-4 py-4 text-foreground text-sm leading-normal">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="px-4 py-2.5 bg-muted/30 border-t border-border flex justify-end gap-2 rounded-b-md">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
