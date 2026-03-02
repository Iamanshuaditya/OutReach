"use client";

import { useState } from "react";
import {
    X, Sparkles, Loader2, Filter, Save, Play,
    ChevronRight, CheckCircle2, Wand2, Bookmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ICPVariant {
    label: string;
    filters: {
        titles_include: string[];
        titles_exclude: string[];
        industries_include: string[];
        company_size_range: [number, number] | null;
        geo: {
            countries: string[];
            states: string[];
            cities: string[];
        };
        verification: {
            min_confidence: number;
            freshness_days_max: number;
            exclude_catch_all: boolean;
            exclude_disposable: boolean;
        };
    };
}

interface ICPResult {
    playbook_name: string;
    explanation: string;
    variants: ICPVariant[];
    prompt: string;
}

interface ICPBuilderModalProps {
    open: boolean;
    onClose: () => void;
    onApplyFilters: (filters: ICPVariant['filters']) => void;
}

const EXAMPLES = [
    "Find US aviation companies 20–200 employees, founder/CEO, verified email, Texas",
    "SaaS CFOs at 50–500 employee companies, hiring finance roles",
    "E-commerce founders in California with verified emails, companies under 100 people",
    "Healthcare IT directors at mid-market hospitals, East Coast",
];

export default function ICPBuilderModal({ open, onClose, onApplyFilters }: ICPBuilderModalProps) {
    const [prompt, setPrompt] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ICPResult | null>(null);
    const [activeVariant, setActiveVariant] = useState(0);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch('/api/icp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });

            if (!res.ok) {
                throw new Error('Failed to generate ICP');
            }

            const data = await res.json();
            setResult(data);
            setActiveVariant(0);
        } catch (err) {
            setError('Failed to generate ICP. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleApply = () => {
        if (result && result.variants[activeVariant]) {
            onApplyFilters(result.variants[activeVariant].filters);
            onClose();
        }
    };

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    if (!open) return null;

    const currentVariant = result?.variants[activeVariant];

    return (
        <div className="fixed inset-0 z-50 cmd-backdrop animate-fade-in" onClick={onClose}>
            <div className="fixed left-1/2 top-[10%] -translate-x-1/2 w-full max-w-[640px] max-h-[80vh] animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="glass-strong rounded-2xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col max-h-[80vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold">AI ICP Builder</h2>
                                <p className="text-[11px] text-muted-foreground">Describe your ideal customer in plain English</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Prompt Input */}
                    <div className="p-5 border-b border-white/[0.06]">
                        <div className="relative">
                            <textarea
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                placeholder="Describe your ideal customer profile..."
                                rows={3}
                                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/40 transition-colors"
                                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleGenerate(); }}
                            />
                            <div className="absolute right-2 bottom-2">
                                <Button
                                    size="sm"
                                    onClick={handleGenerate}
                                    disabled={loading || !prompt.trim()}
                                    className="h-7 text-xs bg-primary hover:bg-primary/80 rounded-lg"
                                >
                                    {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
                                    {loading ? 'Generating...' : 'Generate'}
                                </Button>
                            </div>
                        </div>
                        {/* Examples */}
                        {!result && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                <span className="text-[10px] text-muted-foreground/60 mr-1 self-center">Try:</span>
                                {EXAMPLES.map((ex, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setPrompt(ex)}
                                        className="text-[11px] text-muted-foreground hover:text-foreground bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-full px-2.5 py-1 transition-colors truncate max-w-[280px]"
                                    >
                                        {ex}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Results */}
                    <div className="flex-1 overflow-y-auto">
                        {error && (
                            <div className="m-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                                {error}
                            </div>
                        )}

                        {loading && (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <div className="relative">
                                    <div className="w-12 h-12 rounded-full border-2 border-primary/20 flex items-center justify-center">
                                        <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                                    </div>
                                    <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
                                </div>
                                <p className="text-xs text-muted-foreground">Analyzing your ideal customer...</p>
                                <p className="text-[10px] text-muted-foreground/50">Generating persona variants</p>
                            </div>
                        )}

                        {result && !loading && (
                            <div className="p-5 space-y-4 animate-slide-up">
                                {/* Playbook Name + Explanation */}
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold flex items-center gap-1.5">
                                            <Bookmark className="w-3.5 h-3.5 text-primary" />
                                            {result.playbook_name}
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{result.explanation}</p>
                                    </div>
                                </div>

                                {/* Variant Tabs */}
                                {result.variants.length > 1 && (
                                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                                        {result.variants.map((v, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setActiveVariant(i)}
                                                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeVariant === i
                                                        ? 'bg-primary/20 text-primary border border-primary/20'
                                                        : 'bg-white/[0.03] text-muted-foreground hover:text-foreground border border-white/[0.06]'
                                                    }`}
                                            >
                                                {v.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Filter Preview */}
                                {currentVariant && (
                                    <div className="space-y-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                            <Filter className="w-3 h-3" /> Generated Filters
                                        </div>

                                        <div className="grid gap-2">
                                            {currentVariant.filters.titles_include.length > 0 && (
                                                <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Titles Include</div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {currentVariant.filters.titles_include.map((t, i) => (
                                                            <Badge key={i} variant="secondary" className="text-[11px] bg-primary/10 text-primary border-primary/20">{t}</Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {currentVariant.filters.titles_exclude.length > 0 && (
                                                <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Titles Exclude</div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {currentVariant.filters.titles_exclude.map((t, i) => (
                                                            <Badge key={i} variant="secondary" className="text-[11px] bg-red-500/10 text-red-400 border-red-500/20">{t}</Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {currentVariant.filters.industries_include.length > 0 && (
                                                <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Industries</div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {currentVariant.filters.industries_include.map((ind, i) => (
                                                            <Badge key={i} variant="secondary" className="text-[11px] bg-blue-500/10 text-blue-400 border-blue-500/20">{ind}</Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-2">
                                                {currentVariant.filters.company_size_range && (
                                                    <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Company Size</div>
                                                        <div className="text-xs font-medium">{currentVariant.filters.company_size_range[0]} – {currentVariant.filters.company_size_range[1]}</div>
                                                    </div>
                                                )}

                                                {(currentVariant.filters.geo.countries.length > 0 || currentVariant.filters.geo.states.length > 0) && (
                                                    <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Geography</div>
                                                        <div className="text-xs font-medium">
                                                            {[...currentVariant.filters.geo.countries, ...currentVariant.filters.geo.states, ...currentVariant.filters.geo.cities].join(', ')}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Verification Settings</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    <Badge variant="outline" className="text-[10px] border-green-500/20 text-green-400 bg-green-500/5">
                                                        Min Confidence: {currentVariant.filters.verification.min_confidence}%
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px] border-blue-500/20 text-blue-400 bg-blue-500/5">
                                                        Max Age: {currentVariant.filters.verification.freshness_days_max}d
                                                    </Badge>
                                                    {currentVariant.filters.verification.exclude_catch_all && (
                                                        <Badge variant="outline" className="text-[10px] border-amber-500/20 text-amber-400 bg-amber-500/5">No Catch-All</Badge>
                                                    )}
                                                    {currentVariant.filters.verification.exclude_disposable && (
                                                        <Badge variant="outline" className="text-[10px] border-red-500/20 text-red-400 bg-red-500/5">No Disposable</Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    {result && !loading && (
                        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
                            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={handleSave}>
                                {saved ? <CheckCircle2 className="w-3 h-3 mr-1.5 text-green-400" /> : <Save className="w-3 h-3 mr-1.5" />}
                                {saved ? 'Saved!' : 'Save Playbook'}
                            </Button>
                            <Button size="sm" className="text-xs h-8 bg-primary hover:bg-primary/80" onClick={handleApply}>
                                <Play className="w-3 h-3 mr-1.5" />
                                Apply Filters
                                <ChevronRight className="w-3 h-3 ml-1" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
