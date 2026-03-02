"use client";

import { useState } from "react";
import {
    X, Shield, Clock, CheckCircle2, XCircle, AlertTriangle,
    TrendingUp, Zap, BarChart3, MessageSquare, Lightbulb, Sparkles,
    ChevronDown, ChevronRight, ExternalLink, Mail, Globe,
    Linkedin, Phone, Flame, ThermometerSun, Snowflake, Loader2,
    Target, Eye, Send, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Lead } from "@/lib/types";
import { enrichLead, generateProofTrail, generateLeadInsight } from "@/lib/scoring";

interface LeadDetailPanelProps {
    lead: Lead | null;
    onClose: () => void;
}

export default function LeadDetailPanel({ lead, onClose }: LeadDetailPanelProps) {
    const [activeTab, setActiveTab] = useState<'overview' | 'proof' | 'insights'>('overview');
    const [insightsData, setInsightsData] = useState<ReturnType<typeof generateLeadInsight> | null>(null);
    const [insightsLoading, setInsightsLoading] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ confidence: true, scoring: true });
    const [copiedField, setCopiedField] = useState<string | null>(null);

    if (!lead) return null;

    const enriched = enrichLead(lead);
    const proofTrail = generateProofTrail(lead);

    const toggleSection = (s: string) => setExpandedSections(prev => ({ ...prev, [s]: !prev[s] }));

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 1500);
    };

    const loadInsights = async () => {
        if (insightsData) return;
        setInsightsLoading(true);
        try {
            const res = await fetch('/api/insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead }),
            });
            if (res.ok) {
                const data = await res.json();
                setInsightsData(data);
            } else {
                setInsightsData(generateLeadInsight(lead));
            }
        } catch {
            setInsightsData(generateLeadInsight(lead));
        } finally {
            setInsightsLoading(false);
        }
    };

    const ScoreBadge = ({ bucket }: { bucket: string }) => {
        const config = {
            hot: { icon: <Flame className="w-3 h-3" />, class: "badge-hot", label: "HOT" },
            warm: { icon: <ThermometerSun className="w-3 h-3" />, class: "badge-warm", label: "WARM" },
            cold: { icon: <Snowflake className="w-3 h-3" />, class: "badge-cold", label: "COLD" },
        }[bucket] || { icon: null, class: "badge-cold", label: "N/A" };
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${config.class}`}>
                {config.icon} {config.label}
            </span>
        );
    };

    const ConfidenceRing = ({ value }: { value: number }) => {
        const circumference = 2 * Math.PI * 28;
        const offset = circumference - (value / 100) * circumference;
        const color = value >= 80 ? "#22c55e" : value >= 60 ? "#f59e0b" : "#ef4444";
        return (
            <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                    <circle cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="4"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        strokeLinecap="round" className="transition-all duration-700" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{value}</span>
            </div>
        );
    };

    const SaturationMeter = ({ value, score }: { value: number; score: string }) => {
        const satClass = score === 'low' ? 'sat-low' : score === 'medium' ? 'sat-medium' : 'sat-high';
        return (
            <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Saturation</span>
                    <span className={`font-medium ${score === 'low' ? 'text-green-400' : score === 'medium' ? 'text-amber-400' : 'text-red-400'}`}>
                        {score.charAt(0).toUpperCase() + score.slice(1)}
                    </span>
                </div>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${satClass}`} style={{ width: `${value}%` }} />
                </div>
            </div>
        );
    };

    return (
        <div className="w-[420px] h-full border-l border-border bg-card flex flex-col animate-slide-in-right overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">
                        {String(lead.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{lead.name || 'Unknown'}</h3>
                        <p className="text-xs text-muted-foreground truncate">{lead.title || 'No title'}</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={onClose}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Lead Score + Company Bar */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0 bg-white/[0.01]">
                <div className="flex items-center gap-2">
                    <ScoreBadge bucket={enriched.lead_score_bucket} />
                    <span className="text-xs text-muted-foreground">Score: {enriched.lead_score}</span>
                </div>
                <span className="text-xs text-muted-foreground truncate max-w-[150px]">{lead.company || '—'}</span>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border flex-shrink-0">
                {[
                    { key: 'overview' as const, label: 'Overview', icon: <Eye className="w-3.5 h-3.5" /> },
                    { key: 'proof' as const, label: 'Proof Trail', icon: <Shield className="w-3.5 h-3.5" /> },
                    { key: 'insights' as const, label: 'Insights', icon: <Lightbulb className="w-3.5 h-3.5" /> },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key); if (tab.key === 'insights') loadInsights(); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${activeTab === tab.key
                            ? 'text-primary border-primary'
                            : 'text-muted-foreground border-transparent hover:text-foreground'
                            }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'overview' && (
                    <div className="p-4 space-y-4">
                        {/* Contact Info */}
                        <div className="space-y-2">
                            {lead.email && (
                                <div className="flex items-center justify-between group">
                                    <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm text-primary hover:underline truncate">
                                        <Mail className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                                        <span className="truncate">{String(lead.email)}</span>
                                    </a>
                                    <button onClick={() => copyToClipboard(String(lead.email), 'email')}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Copy className="w-3 h-3 text-muted-foreground" />
                                    </button>
                                </div>
                            )}
                            {lead.website && (
                                <a href={String(lead.website).startsWith('http') ? String(lead.website) : `https://${lead.website}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-sm text-primary hover:underline truncate">
                                    <Globe className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                                    <span className="truncate">{String(lead.website).replace(/^https?:\/\/(www\.)?/, '').slice(0, 35)}</span>
                                    <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-40" />
                                </a>
                            )}
                            {lead.linkedin && (
                                <a href={String(lead.linkedin).startsWith('http') ? String(lead.linkedin) : `https://${lead.linkedin}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-sm text-blue-400 hover:underline">
                                    <Linkedin className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span>LinkedIn Profile</span>
                                    <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-40" />
                                </a>
                            )}
                            <div className="flex items-center justify-between group">
                                <div className={`flex items-center gap-2 text-sm ${lead.phone ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                                    <Phone className={`w-3.5 h-3.5 flex-shrink-0 ${lead.phone ? 'text-blue-400' : 'opacity-40'}`} />
                                    <span>{lead.phone ? String(lead.phone) : 'No phone number'}</span>
                                </div>
                                {lead.phone && (
                                    <button onClick={() => copyToClipboard(String(lead.phone), 'phone')}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        {copiedField === 'phone' ? (
                                            <CheckCircle2 className="w-3 h-3 text-green-400" />
                                        ) : (
                                            <Copy className="w-3 h-3 text-muted-foreground" />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        <Separator className="bg-white/[0.06]" />

                        {/* Location */}
                        {(lead.city || lead.state || lead.country) && (
                            <div className="text-xs text-muted-foreground">
                                📍 {[lead.city, lead.state, lead.country].filter(Boolean).join(', ')}
                            </div>
                        )}

                        {/* Confidence Breakdown */}
                        <div>
                            <button onClick={() => toggleSection('confidence')} className="w-full flex items-center justify-between py-1">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confidence</span>
                                {expandedSections.confidence ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                            </button>
                            {expandedSections.confidence && (
                                <div className="mt-2 flex items-start gap-4 animate-slide-up">
                                    <ConfidenceRing value={enriched.email_confidence_score} />
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-1.5 text-xs">
                                            {enriched.email_verification_status === 'verified' ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                                            ) : enriched.email_verification_status === 'invalid' || enriched.email_verification_status === 'disposable' ? (
                                                <XCircle className="w-3.5 h-3.5 text-red-400" />
                                            ) : (
                                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                            )}
                                            <span className="capitalize">{enriched.email_verification_status.replace('-', ' ')}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {enriched.freshness_days_ago !== null && (
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    Verified {enriched.freshness_days_ago}d ago
                                                </span>
                                            )}
                                        </div>
                                        {enriched.email_confidence_score >= 80 && (
                                            <div className="text-[10px] text-green-400/70 mt-1">
                                                If this bounces, you&apos;re refunded automatically
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <Separator className="bg-white/[0.06]" />

                        {/* Scoring */}
                        <div>
                            <button onClick={() => toggleSection('scoring')} className="w-full flex items-center justify-between py-1">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scoring</span>
                                {expandedSections.scoring ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                            </button>
                            {expandedSections.scoring && (
                                <div className="mt-2 space-y-3 animate-slide-up">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-white/[0.03] rounded-lg p-2.5">
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">ICP Fit</div>
                                            <div className="text-lg font-bold mt-0.5">{enriched.icp_fit_score}<span className="text-xs text-muted-foreground font-normal">/100</span></div>
                                        </div>
                                        <div className="bg-white/[0.03] rounded-lg p-2.5">
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Lead Score</div>
                                            <div className="text-lg font-bold mt-0.5">{enriched.lead_score}<span className="text-xs text-muted-foreground font-normal">/100</span></div>
                                        </div>
                                    </div>
                                    <SaturationMeter value={enriched.saturation_value} score={enriched.saturation_score} />
                                    {enriched.saturation_score === 'high' && (
                                        <div className="text-[10px] text-amber-400/80 bg-amber-400/5 rounded-md px-2.5 py-1.5 border border-amber-400/10">
                                            ⚠️ High saturation — Try adjacent personas for better reply rates
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <Separator className="bg-white/[0.06]" />

                        {/* Recommended Action */}
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recommended Action</div>
                            <div className="flex gap-2">
                                {enriched.email_verification_status === 'verified' && enriched.email_confidence_score >= 70 ? (
                                    <Button size="sm" className="flex-1 h-8 text-xs bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20">
                                        <Send className="w-3 h-3 mr-1.5" /> Email
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" disabled>
                                        <Send className="w-3 h-3 mr-1.5" /> Email (risky)
                                    </Button>
                                )}
                                {lead.linkedin ? (
                                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-blue-400 border-blue-400/20 hover:bg-blue-400/10">
                                        <Linkedin className="w-3 h-3 mr-1.5" /> LinkedIn
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" disabled>
                                        <Linkedin className="w-3 h-3 mr-1.5" /> N/A
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'proof' && (
                    <div className="p-4 space-y-3">
                        <div className="text-xs text-muted-foreground mb-3">
                            Verification history showing how each field was validated.
                        </div>
                        {proofTrail.map((entry, i) => (
                            <div key={i} className="relative pl-6 pb-4 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                                {/* Timeline line */}
                                {i < proofTrail.length - 1 && (
                                    <div className="absolute left-[9px] top-5 w-px h-[calc(100%-8px)] bg-white/[0.06]" />
                                )}
                                {/* Timeline dot */}
                                <div className={`absolute left-0 top-1 w-[18px] h-[18px] rounded-full flex items-center justify-center ${entry.status === 'verified' ? 'bg-green-500/20' : entry.status === 'failed' ? 'bg-red-500/20' : 'bg-amber-500/20'
                                    }`}>
                                    {entry.status === 'verified' ? (
                                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    ) : entry.status === 'failed' ? (
                                        <XCircle className="w-3 h-3 text-red-400" />
                                    ) : (
                                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                                    )}
                                </div>
                                <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/[0.04]">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium capitalize">{entry.field.replace('_', ' ')}</span>
                                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${entry.status === 'verified' ? 'border-green-500/30 text-green-400' : 'border-amber-500/30 text-amber-400'
                                            }`}>
                                            {entry.confidence}%
                                        </Badge>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">{entry.method}</div>
                                    <div className="text-[10px] text-muted-foreground/60 mt-1">
                                        {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div className="mt-2 p-2.5 rounded-lg bg-green-500/5 border border-green-500/10 text-[11px] text-green-400/80">
                            <Shield className="w-3 h-3 inline mr-1" />
                            Refund eligible — If this email bounces after sending, credits are automatically refunded.
                        </div>
                    </div>
                )}

                {activeTab === 'insights' && (
                    <div className="p-4 space-y-4">
                        {insightsLoading ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-3">
                                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                <p className="text-xs text-muted-foreground">Generating AI insights...</p>
                            </div>
                        ) : insightsData ? (
                            <>
                                {/* TL;DR */}
                                <div className="animate-slide-up">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">TL;DR</div>
                                    <p className="text-sm text-foreground/90 leading-relaxed">{insightsData.tldr}</p>
                                </div>

                                <Separator className="bg-white/[0.06]" />

                                {/* Why This Person */}
                                <div className="animate-slide-up stagger-1">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                                        <Target className="w-3 h-3" /> Why This Person
                                    </div>
                                    <p className="text-xs text-foreground/80 leading-relaxed">{insightsData.why_relevant}</p>
                                </div>

                                <Separator className="bg-white/[0.06]" />

                                {/* Pitch Angle */}
                                <div className="animate-slide-up stagger-2">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" /> What to Say
                                    </div>
                                    <p className="text-xs text-foreground/80 leading-relaxed">{insightsData.pitch_angle}</p>
                                </div>

                                <Separator className="bg-white/[0.06]" />

                                {/* Subject Lines */}
                                <div className="animate-slide-up stagger-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                                        <Mail className="w-3 h-3" /> Subject Lines
                                    </div>
                                    <div className="space-y-1.5">
                                        {insightsData.subject_lines.map((line: string, i: number) => (
                                            <div key={i} className="flex items-center justify-between gap-2 group bg-white/[0.02] rounded-md px-2.5 py-2 border border-white/[0.04]">
                                                <span className="text-xs text-foreground/80">{line}</span>
                                                <button onClick={() => copyToClipboard(line, `subject-${i}`)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                    {copiedField === `subject-${i}` ? (
                                                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                                                    ) : (
                                                        <Copy className="w-3 h-3 text-muted-foreground" />
                                                    )}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Separator className="bg-white/[0.06]" />

                                {/* Objections */}
                                <div className="animate-slide-up stagger-4">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                                        <MessageSquare className="w-3 h-3" /> Objections & Rebuttals
                                    </div>
                                    <div className="space-y-2">
                                        {insightsData.objections.map((obj: { objection: string; rebuttal: string }, i: number) => (
                                            <div key={i} className="bg-white/[0.02] rounded-lg p-2.5 border border-white/[0.04] space-y-1.5">
                                                <div className="text-xs font-medium text-red-400/80">&ldquo;{obj.objection}&rdquo;</div>
                                                <div className="text-xs text-foreground/70 leading-relaxed">→ {obj.rebuttal}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                                <Lightbulb className="w-8 h-8 opacity-20" />
                                <p className="text-xs">Click to generate AI insights</p>
                                <Button size="sm" onClick={loadInsights} className="text-xs">
                                    <Sparkles className="w-3 h-3 mr-1.5" /> Generate
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
