import React from 'react';
import { Search } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: React.ReactNode;
}

export default function Input({
    label,
    error,
    icon,
    className = '',
    ...props
}: InputProps) {
    const needsVerticalGap = Boolean(label || error);
    return (
        <div className={`flex flex-col ${needsVerticalGap ? 'gap-1.5' : ''} ${className.includes('w-') ? className : 'w-full'}`}>
            {label && (
                <label className="text-sm font-medium text-muted-foreground">
                    {label}
                </label>
            )}
            <div className="relative">
                {icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {icon}
                    </div>
                )}
                <input
                    className={`
                        flex h-10 w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm 
                        ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium 
                        placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 
                        focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed 
                        disabled:opacity-50 transition-all
                        ${icon ? 'pl-9' : ''}
                        ${error ? 'border-destructive focus-visible:ring-destructive' : 'border-border'}
                        ${className}
                    `}
                    {...props}
                />
            </div>
            {error && (
                <span className="text-[10px] font-medium text-destructive">
                    {error}
                </span>
            )}
        </div>
    );
}

// Specialized Search Input
export function SearchInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <Input
            icon={<Search size={14} />}
            className={className}
            {...props}
        />
    );
}
