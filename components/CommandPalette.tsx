"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Search, Sparkles, Filter, Download, Users, Zap,
    ArrowRight, Command, LayoutGrid, FileText, Star,
} from "lucide-react";

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    onAction: (action: string, payload?: Record<string, unknown>) => void;
    tables: Array<{ table_name: string; row_count: number }>;
}

interface CommandItem {
    id: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    category: string;
    action: string;
    shortcut?: string;
}

export default function CommandPalette({ open, onClose, onAction, tables }: CommandPaletteProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const commands: CommandItem[] = [
        {
            id: "icp-builder", label: "Build ICP with AI", description: "Describe your ideal customer in plain English",
            icon: <Sparkles className="w-4 h-4 text-purple-400" />, category: "AI Tools", action: "open-icp-builder", shortcut: "⌘I"
        },
        {
            id: "filter-hot", label: "Show Hot Leads Only", description: "Filter to high-scoring leads ready for outreach",
            icon: <Zap className="w-4 h-4 text-red-400" />, category: "Quick Filters", action: "filter-hot"
        },
        {
            id: "filter-verified", label: "Verified Emails Only", description: "Show only leads with verified email addresses",
            icon: <Filter className="w-4 h-4 text-green-400" />, category: "Quick Filters", action: "filter-verified"
        },
        {
            id: "health-report", label: "Run Health Report", description: "Check deliverability health of current list",
            icon: <FileText className="w-4 h-4 text-blue-400" />, category: "Actions", action: "health-report"
        },
        {
            id: "export", label: "Export Selected Leads", description: "Download leads as CSV",
            icon: <Download className="w-4 h-4 text-amber-400" />, category: "Actions", action: "export"
        },
        {
            id: "top-200", label: "Auto-Queue: Top 200 Leads", description: "AI-curated list of best leads for today",
            icon: <Star className="w-4 h-4 text-yellow-400" />, category: "AI Tools", action: "top-200"
        },
        ...tables.slice(0, 8).map(t => ({
            id: `table-${t.table_name}`,
            label: t.table_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            description: `${t.row_count.toLocaleString()} leads`,
            icon: <LayoutGrid className="w-4 h-4 text-muted-foreground" />,
            category: "Tables",
            action: "select-table",
            shortcut: undefined,
        })),
    ];

    const filtered = query
        ? commands.filter(c =>
            c.label.toLowerCase().includes(query.toLowerCase()) ||
            c.description.toLowerCase().includes(query.toLowerCase()) ||
            c.category.toLowerCase().includes(query.toLowerCase())
        )
        : commands;

    const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
        if (!acc[cmd.category]) acc[cmd.category] = [];
        acc[cmd.category].push(cmd);
        return acc;
    }, {});

    const flatItems = Object.values(grouped).flat();

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Escape") { onClose(); return; }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1));
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        }
        if (e.key === "Enter" && flatItems[selectedIndex]) {
            const item = flatItems[selectedIndex];
            if (item.action === "select-table") {
                onAction(item.action, { table: item.id.replace("table-", "") });
            } else {
                onAction(item.action);
            }
            onClose();
        }
    }, [flatItems, selectedIndex, onAction, onClose]);

    useEffect(() => {
        if (open) {
            inputRef.current?.focus();
            setQuery("");
            setSelectedIndex(0);
            document.addEventListener("keydown", handleKeyDown);
            return () => document.removeEventListener("keydown", handleKeyDown);
        }
    }, [open, handleKeyDown]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 cmd-backdrop animate-fade-in" onClick={onClose}>
            <div className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-[580px] animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="glass-strong rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
                    {/* Search Input */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                            placeholder="Search commands, tables, actions..."
                            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                        />
                        <kbd className="text-[10px] text-muted-foreground bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/[0.08] font-mono">ESC</kbd>
                    </div>

                    {/* Results */}
                    <div className="max-h-[360px] overflow-y-auto py-2">
                        {Object.entries(grouped).map(([category, items]) => (
                            <div key={category}>
                                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                                    {category}
                                </div>
                                {items.map(item => {
                                    const globalIdx = flatItems.indexOf(item);
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => {
                                                if (item.action === "select-table") {
                                                    onAction(item.action, { table: item.id.replace("table-", "") });
                                                } else {
                                                    onAction(item.action);
                                                }
                                                onClose();
                                            }}
                                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${globalIdx === selectedIndex
                                                    ? "bg-primary/10 text-foreground"
                                                    : "text-foreground/80 hover:bg-white/[0.03]"
                                                }`}
                                        >
                                            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
                                                {item.icon}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium truncate">{item.label}</div>
                                                <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                                            </div>
                                            {item.shortcut ? (
                                                <kbd className="text-[10px] text-muted-foreground bg-white/[0.04] px-1.5 py-0.5 rounded font-mono">
                                                    {item.shortcut}
                                                </kbd>
                                            ) : (
                                                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                        {flatItems.length === 0 && (
                            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                                No commands match &ldquo;{query}&rdquo;
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2 border-t border-white/[0.06] flex items-center gap-4 text-[10px] text-muted-foreground/50">
                        <span className="flex items-center gap-1"><kbd className="bg-white/[0.04] px-1 rounded">↑↓</kbd> navigate</span>
                        <span className="flex items-center gap-1"><kbd className="bg-white/[0.04] px-1 rounded">↵</kbd> select</span>
                        <span className="flex items-center gap-1"><kbd className="bg-white/[0.04] px-1 rounded">esc</kbd> close</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
