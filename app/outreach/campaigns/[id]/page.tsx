"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import {
    ChevronLeft, Mail, Clock, Target, Send, Eye, MessageSquare,
    Sparkles, AlertTriangle, CheckCircle2, XCircle, Loader2,
    Play, Pause, Users, ArrowRight, Activity, BarChart3,
    Globe, Flame, Shield, Edit3, Check, X, ChevronDown, ChevronUp,
    Zap, Ban, RotateCcw, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

// ─── Types ──────────────────────────────────────────

interface CampaignStep {
    id: string;
    step_number: number;
    type: "email" | "wait" | "condition";
    subject_template: string;
    body_template: string;
    ai_personalize: boolean;
    tone: string;
    wait_days: number;
    condition: string | null;
    sent: number;
    opened: number;
    replied: number;
    bounced: number;
}

interface CampaignStats {
    total_leads: number;
    total_sent: number;
    total_delivered: number;
    total_opened: number;
    total_clicked: number;
    total_replied: number;
    total_bounced: number;
    total_unsubscribed: number;
    positive_replies: number;
    credits_used: number;
    credits_refunded: number;
    current_step: number;
}

interface SendingWindow {
    start_hour: number;
    end_hour: number;
    timezone: string;
    days: string[];
}

interface CampaignInbox {
    inbox_id: string;
    email: string;
    display_name: string;
    is_active: boolean;
    daily_limit: number;
    daily_sent: number;
    warmup_level: string;
    health_score: number;
}

interface QueueItem {
    recipient_email: string;
    status: string;
    scheduled_at: string;
    sent_at: string | null;
    last_error: string | null;
    attempts: number;
}

interface ActivityLog {
    id: string;
    created_at: string;
    level: string;
    message: string;
    log_type: string;
    metadata: Record<string, unknown> | null;
}

interface CampaignDetail {
    id: string;
    name: string;
    status: string;
    send_mode: string;
    lead_count: number;
    lead_source: string;
    created_at: string;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    sending_window: SendingWindow;
    stats: CampaignStats;
    health_check: Record<string, unknown> | null;
    sender_name: string;
    sender_company: string;
    product_description: string;
    value_proposition: string;
    max_per_hour_per_inbox: number;
    min_interval_seconds: number;
    max_interval_seconds: number;
}

interface CampaignData {
    campaign: CampaignDetail;
    steps: CampaignStep[];
    inboxes: CampaignInbox[];
    queue_summary: Record<string, number>;
    queue_items: QueueItem[];
    activity_logs: ActivityLog[];
    lead_states: Record<string, number>;
}

// ─── Helpers ────────────────────────────────────────

function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
}

function formatPercent(numerator: number, denominator: number): string {
    if (denominator === 0) return "0%";
    return (numerator / denominator * 100).toFixed(1) + "%";
}

function formatHour(h: number): string {
    if (h === 0) return "12:00 AM";
    if (h === 12) return "12:00 PM";
    if (h < 12) return `${h}:00 AM`;
    return `${h - 12}:00 PM`;
}

function timeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
}

function formatDateTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
    draft: { bg: "bg-zinc-500/10", text: "text-zinc-400" },
    review: { bg: "bg-yellow-500/10", text: "text-yellow-400" },
    scheduled: { bg: "bg-blue-500/10", text: "text-blue-400" },
    active: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
    paused: { bg: "bg-orange-500/10", text: "text-orange-400" },
    completed: { bg: "bg-purple-500/10", text: "text-purple-400" },
    aborted: { bg: "bg-red-500/10", text: "text-red-400" },
};

const QUEUE_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
    pending: { bg: "bg-zinc-500/10", text: "text-zinc-400" },
    sending: { bg: "bg-blue-500/10", text: "text-blue-400" },
    sent: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
    failed: { bg: "bg-red-500/10", text: "text-red-400" },
    cancelled: { bg: "bg-orange-500/10", text: "text-orange-400" },
};

const LOG_LEVEL_STYLES: Record<string, string> = {
    info: "text-blue-400",
    warn: "text-yellow-400",
    error: "text-red-400",
};

// ─── Component ──────────────────────────────────────

export default function CampaignDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);

    const [data, setData] = useState<CampaignData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Inline name editing
    const [editingName, setEditingName] = useState(false);
    const [nameValue, setNameValue] = useState("");
    const [savingName, setSavingName] = useState(false);

    // Pause/Resume
    const [togglingStatus, setTogglingStatus] = useState(false);

    // Expandable metadata in activity log
    const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

    const fetchCampaign = useCallback(async () => {
        try {
            const res = await fetch(`/api/outreach/campaigns/${id}`);
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error((body as { error?: string }).error || "Failed to fetch campaign");
            }
            const json = (await res.json()) as CampaignData;
            setData(json);
            setNameValue(json.campaign.name);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchCampaign();
    }, [fetchCampaign]);

    // Auto-refresh every 30s for active campaigns
    useEffect(() => {
        if (!data || !["active", "sending"].includes(data.campaign.status)) return;
        const interval = setInterval(fetchCampaign, 30_000);
        return () => clearInterval(interval);
    }, [data, fetchCampaign]);

    async function saveName() {
        if (!data || nameValue.trim() === data.campaign.name) {
            setEditingName(false);
            return;
        }
        setSavingName(true);
        try {
            const res = await fetch(`/api/outreach/campaigns/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: nameValue.trim() }),
            });
            if (res.ok) {
                setData((prev) =>
                    prev ? { ...prev, campaign: { ...prev.campaign, name: nameValue.trim() } } : prev
                );
            }
        } finally {
            setSavingName(false);
            setEditingName(false);
        }
    }

    async function toggleStatus() {
        if (!data) return;
        const newStatus = data.campaign.status === "active" ? "paused" : "active";
        setTogglingStatus(true);
        try {
            const res = await fetch(`/api/outreach/campaigns/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                setData((prev) =>
                    prev ? { ...prev, campaign: { ...prev.campaign, status: newStatus } } : prev
                );
            }
        } finally {
            setTogglingStatus(false);
        }
    }

    function toggleLogExpand(logId: string) {
        setExpandedLogs((prev) => {
            const next = new Set(prev);
            if (next.has(logId)) next.delete(logId);
            else next.add(logId);
            return next;
        });
    }

    // ─── Loading / Error states ─────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center space-y-4">
                    <XCircle className="w-10 h-10 text-red-400 mx-auto" />
                    <p className="text-zinc-400">{error || "Campaign not found"}</p>
                    <Link href="/outreach">
                        <Button variant="outline" size="sm" className="border-zinc-800 text-zinc-400 hover:text-white">
                            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Outreach
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    const { campaign, steps, inboxes, queue_summary, queue_items, activity_logs, lead_states } = data;
    const s = campaign.stats;
    const statusStyle = STATUS_STYLES[campaign.status] || STATUS_STYLES.draft;

    // ─── Render ─────────────────────────────────────

    return (
        <div className="min-h-screen bg-black">
            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

                {/* ────── Header ────── */}
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <Link
                            href="/outreach"
                            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" /> Back to Outreach
                        </Link>

                        <div className="flex items-center gap-3">
                            {editingName ? (
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={nameValue}
                                        onChange={(e) => setNameValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") saveName();
                                            if (e.key === "Escape") {
                                                setNameValue(campaign.name);
                                                setEditingName(false);
                                            }
                                        }}
                                        className="text-xl font-semibold bg-zinc-900 border-zinc-700 text-white h-10 w-80"
                                        autoFocus
                                    />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={saveName}
                                        disabled={savingName}
                                        className="text-emerald-400 hover:text-emerald-300"
                                    >
                                        {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => { setNameValue(campaign.name); setEditingName(false); }}
                                        className="text-zinc-500 hover:text-zinc-300"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 group">
                                    <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
                                    <button
                                        onClick={() => setEditingName(true)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-300"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            <Badge className={`${statusStyle.bg} ${statusStyle.text} border-0 uppercase text-xs font-medium`}>
                                {campaign.status}
                            </Badge>
                        </div>

                        <p className="text-sm text-zinc-500">
                            Created {timeAgo(campaign.created_at)}
                            {campaign.started_at && <> &middot; Started {timeAgo(campaign.started_at)}</>}
                            {campaign.completed_at && <> &middot; Completed {timeAgo(campaign.completed_at)}</>}
                        </p>
                    </div>

                    {(campaign.status === "active" || campaign.status === "paused") && (
                        <Button
                            onClick={toggleStatus}
                            disabled={togglingStatus}
                            variant="outline"
                            className={`border-zinc-800 ${
                                campaign.status === "active"
                                    ? "text-orange-400 hover:text-orange-300 hover:border-orange-800"
                                    : "text-emerald-400 hover:text-emerald-300 hover:border-emerald-800"
                            }`}
                        >
                            {togglingStatus ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : campaign.status === "active" ? (
                                <Pause className="w-4 h-4 mr-2" />
                            ) : (
                                <Play className="w-4 h-4 mr-2" />
                            )}
                            {campaign.status === "active" ? "Pause" : "Resume"}
                        </Button>
                    )}
                </div>

                <Separator className="bg-zinc-800/50" />

                {/* ────── Overview Stats ────── */}
                <div>
                    <h2 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" /> Performance Overview
                    </h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-9 gap-3">
                        <StatCard label="Total Leads" value={formatNumber(s.total_leads)} icon={<Users className="w-3.5 h-3.5" />} />
                        <StatCard label="Sent" value={formatNumber(s.total_sent)} icon={<Send className="w-3.5 h-3.5" />} />
                        <StatCard label="Delivered" value={formatNumber(s.total_delivered)} icon={<CheckCircle2 className="w-3.5 h-3.5" />} color="text-emerald-400" />
                        <StatCard label="Opened" value={formatNumber(s.total_opened)} icon={<Eye className="w-3.5 h-3.5" />} color="text-blue-400" />
                        <StatCard label="Replied" value={formatNumber(s.total_replied)} icon={<MessageSquare className="w-3.5 h-3.5" />} color="text-purple-400" />
                        <StatCard label="Bounced" value={formatNumber(s.total_bounced)} icon={<XCircle className="w-3.5 h-3.5" />} color="text-red-400" />
                        <StatCard label="Open Rate" value={formatPercent(s.total_opened, s.total_delivered)} icon={<Eye className="w-3.5 h-3.5" />} color="text-blue-400" />
                        <StatCard label="Reply Rate" value={formatPercent(s.total_replied, s.total_delivered)} icon={<MessageSquare className="w-3.5 h-3.5" />} color="text-purple-400" />
                        <StatCard label="Bounce Rate" value={formatPercent(s.total_bounced, s.total_sent)} icon={<AlertTriangle className="w-3.5 h-3.5" />} color="text-orange-400" />
                    </div>
                </div>

                {/* ────── Sending Schedule & Inboxes ────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Schedule */}
                    <div className="border border-zinc-800/50 rounded-lg p-5 space-y-4">
                        <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Sending Schedule
                        </h2>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-zinc-500">Window</span>
                                <p className="text-white mt-0.5">
                                    {formatHour(campaign.sending_window.start_hour)} - {formatHour(campaign.sending_window.end_hour)}
                                </p>
                            </div>
                            <div>
                                <span className="text-zinc-500">Timezone</span>
                                <p className="text-white mt-0.5">{campaign.sending_window.timezone}</p>
                            </div>
                            <div>
                                <span className="text-zinc-500">Days</span>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                    {(campaign.sending_window.days || []).map((day) => (
                                        <Badge key={day} variant="outline" className="border-zinc-700 text-zinc-300 text-xs uppercase">
                                            {day}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <span className="text-zinc-500">Send Mode</span>
                                <div className="mt-1">
                                    <Badge className={`border-0 text-xs ${
                                        campaign.send_mode === "aggressive"
                                            ? "bg-red-500/10 text-red-400"
                                            : campaign.send_mode === "moderate"
                                            ? "bg-yellow-500/10 text-yellow-400"
                                            : "bg-emerald-500/10 text-emerald-400"
                                    }`}>
                                        {campaign.send_mode === "aggressive" && <Flame className="w-3 h-3 mr-1" />}
                                        {campaign.send_mode === "safe" && <Shield className="w-3 h-3 mr-1" />}
                                        {campaign.send_mode}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {campaign.lead_source && (
                            <div className="text-sm">
                                <span className="text-zinc-500">Lead Source</span>
                                <p className="text-zinc-300 mt-0.5 font-mono text-xs">{campaign.lead_source}</p>
                            </div>
                        )}
                    </div>

                    {/* Inboxes */}
                    <div className="border border-zinc-800/50 rounded-lg p-5 space-y-4">
                        <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                            <Globe className="w-4 h-4" /> Assigned Inboxes
                            <span className="text-zinc-600 font-normal">({inboxes.length})</span>
                        </h2>
                        {inboxes.length === 0 ? (
                            <p className="text-sm text-zinc-600">No inboxes assigned</p>
                        ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {inboxes.map((inbox) => (
                                    <div
                                        key={inbox.inbox_id}
                                        className="flex items-center justify-between text-sm border border-zinc-800/40 rounded-md px-3 py-2"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Mail className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                            <span className="text-white truncate">{inbox.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0 text-xs text-zinc-500">
                                            <span>{inbox.daily_sent}/{inbox.daily_limit}</span>
                                            {inbox.warmup_level && inbox.warmup_level !== "hot" && (
                                                <Badge variant="outline" className="border-yellow-800/50 text-yellow-500 text-[10px]">
                                                    {inbox.warmup_level}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ────── Sequence Steps ────── */}
                <div className="border border-zinc-800/50 rounded-lg p-5 space-y-4">
                    <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                        <Target className="w-4 h-4" /> Sequence Steps
                        <span className="text-zinc-600 font-normal">({steps.length} steps)</span>
                    </h2>

                    {steps.length === 0 ? (
                        <p className="text-sm text-zinc-600">No steps configured</p>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            {steps.map((step, idx) => (
                                <div key={step.id} className="flex items-center gap-2">
                                    <StepNode step={step} />
                                    {idx < steps.length - 1 && (
                                        <ArrowRight className="w-4 h-4 text-zinc-700 flex-shrink-0" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Step detail rows */}
                    {steps.filter((st) => st.type === "email").length > 0 && (
                        <>
                            <Separator className="bg-zinc-800/50" />
                            <div className="space-y-3">
                                {steps
                                    .filter((st) => st.type === "email")
                                    .map((step) => (
                                        <div key={step.id} className="flex items-start justify-between gap-4 text-sm">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-zinc-500 text-xs">Step {step.step_number}</span>
                                                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{step.tone}</Badge>
                                                    {step.ai_personalize && (
                                                        <Badge className="bg-purple-500/10 text-purple-400 border-0 text-[10px]">
                                                            <Sparkles className="w-3 h-3 mr-0.5" /> AI
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-white mt-0.5 truncate">
                                                    {step.ai_personalize && !step.subject_template
                                                        ? "AI Generated Subject"
                                                        : step.subject_template || "No subject"}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-zinc-500 flex-shrink-0">
                                                <span className="flex items-center gap-1"><Send className="w-3 h-3" /> {step.sent ?? 0}</span>
                                                <span className="flex items-center gap-1 text-blue-400"><Eye className="w-3 h-3" /> {step.opened ?? 0}</span>
                                                <span className="flex items-center gap-1 text-purple-400"><MessageSquare className="w-3 h-3" /> {step.replied ?? 0}</span>
                                                <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3 h-3" /> {step.bounced ?? 0}</span>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </>
                    )}
                </div>

                {/* ────── Send Queue ────── */}
                <div className="border border-zinc-800/50 rounded-lg p-5 space-y-4">
                    <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                        <Send className="w-4 h-4" /> Send Queue
                    </h2>

                    {/* Summary bar */}
                    <div className="flex flex-wrap gap-3">
                        {(["pending", "sending", "sent", "failed", "cancelled"] as const).map((status) => {
                            const count = queue_summary[status] ?? 0;
                            const style = QUEUE_STATUS_STYLES[status] || QUEUE_STATUS_STYLES.pending;
                            return (
                                <div key={status} className="flex items-center gap-2 text-sm">
                                    <span className={`inline-block w-2 h-2 rounded-full ${style.text.replace("text-", "bg-")}`} />
                                    <span className="text-zinc-400 capitalize">{status}</span>
                                    <span className="text-white font-medium">{formatNumber(count)}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Queue table */}
                    {queue_items.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-zinc-500 text-xs text-left border-b border-zinc-800/50">
                                        <th className="pb-2 font-medium">Recipient</th>
                                        <th className="pb-2 font-medium">Status</th>
                                        <th className="pb-2 font-medium">Scheduled</th>
                                        <th className="pb-2 font-medium">Sent</th>
                                        <th className="pb-2 font-medium">Attempts</th>
                                        <th className="pb-2 font-medium">Error</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/30">
                                    {queue_items.map((item, idx) => {
                                        const qs = QUEUE_STATUS_STYLES[item.status] || QUEUE_STATUS_STYLES.pending;
                                        return (
                                            <tr key={idx} className="text-zinc-300">
                                                <td className="py-2 pr-4 font-mono text-xs">{item.recipient_email}</td>
                                                <td className="py-2 pr-4">
                                                    <Badge className={`${qs.bg} ${qs.text} border-0 text-[10px]`}>
                                                        {item.status}
                                                    </Badge>
                                                </td>
                                                <td className="py-2 pr-4 text-xs text-zinc-500">
                                                    {item.scheduled_at ? formatDateTime(item.scheduled_at) : "-"}
                                                </td>
                                                <td className="py-2 pr-4 text-xs text-zinc-500">
                                                    {item.sent_at ? formatDateTime(item.sent_at) : "-"}
                                                </td>
                                                <td className="py-2 pr-4 text-xs text-zinc-500">{item.attempts}</td>
                                                <td className="py-2 text-xs text-red-400/70 max-w-[200px] truncate">
                                                    {item.last_error || "-"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-zinc-600">No queue items yet</p>
                    )}
                </div>

                {/* ────── Activity Log & Lead States row ────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Activity Log */}
                    <div className="lg:col-span-2 border border-zinc-800/50 rounded-lg p-5 space-y-4">
                        <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                            <Activity className="w-4 h-4" /> Activity Log
                            <span className="text-zinc-600 font-normal">({activity_logs.length})</span>
                        </h2>

                        {activity_logs.length === 0 ? (
                            <p className="text-sm text-zinc-600">No activity yet</p>
                        ) : (
                            <div className="space-y-1 max-h-96 overflow-y-auto">
                                {activity_logs.map((log) => {
                                    const levelColor = LOG_LEVEL_STYLES[log.level] || "text-zinc-400";
                                    const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
                                    const isExpanded = expandedLogs.has(log.id);

                                    return (
                                        <div key={log.id} className="border-b border-zinc-800/20 py-2">
                                            <div className="flex items-start gap-3 text-sm">
                                                <span className="text-zinc-600 text-xs whitespace-nowrap mt-0.5">
                                                    {timeAgo(log.created_at)}
                                                </span>
                                                <span className={`text-xs font-medium uppercase mt-0.5 w-10 ${levelColor}`}>
                                                    {log.level}
                                                </span>
                                                <span className="text-zinc-300 flex-1 min-w-0">
                                                    {log.message}
                                                </span>
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    {log.log_type && (
                                                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                                                            {log.log_type}
                                                        </Badge>
                                                    )}
                                                    {hasMetadata && (
                                                        <button
                                                            onClick={() => toggleLogExpand(log.id)}
                                                            className="text-zinc-600 hover:text-zinc-400 transition-colors"
                                                        >
                                                            {isExpanded ? (
                                                                <ChevronUp className="w-3.5 h-3.5" />
                                                            ) : (
                                                                <ChevronDown className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {isExpanded && hasMetadata && (
                                                <pre className="mt-2 ml-[4.5rem] text-[11px] text-zinc-500 bg-zinc-900/50 rounded p-2 overflow-x-auto">
                                                    {JSON.stringify(log.metadata, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Lead States */}
                    <div className="border border-zinc-800/50 rounded-lg p-5 space-y-4">
                        <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                            <Users className="w-4 h-4" /> Lead States
                        </h2>

                        {Object.keys(lead_states).length === 0 ? (
                            <p className="text-sm text-zinc-600">No lead state data</p>
                        ) : (
                            <div className="space-y-2">
                                {Object.entries(lead_states)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([state, count]) => {
                                        const stateConfig = LEAD_STATE_CONFIG[state] || {
                                            icon: <Users className="w-4 h-4" />,
                                            color: "text-zinc-400",
                                            bg: "bg-zinc-500/10",
                                        };
                                        return (
                                            <div
                                                key={state}
                                                className="flex items-center justify-between border border-zinc-800/40 rounded-md px-3 py-2.5"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className={stateConfig.color}>{stateConfig.icon}</span>
                                                    <span className="text-sm text-zinc-300 capitalize">{state.replace(/_/g, " ")}</span>
                                                </div>
                                                <span className={`text-sm font-medium ${stateConfig.color}`}>
                                                    {formatNumber(count)}
                                                </span>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────

function StatCard({
    label,
    value,
    icon,
    color = "text-zinc-400",
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    color?: string;
}) {
    return (
        <div className="border border-zinc-800/50 rounded-lg px-3 py-3 space-y-1">
            <div className={`flex items-center gap-1.5 text-xs ${color}`}>
                {icon}
                <span className="text-zinc-500">{label}</span>
            </div>
            <p className="text-lg font-semibold text-white">{value}</p>
        </div>
    );
}

function StepNode({ step }: { step: CampaignStep }) {
    if (step.type === "email") {
        return (
            <div className="flex items-center gap-1.5 border border-zinc-800/50 rounded-md px-3 py-2 bg-zinc-900/50">
                <Mail className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs text-white">Email {step.step_number}</span>
            </div>
        );
    }

    if (step.type === "wait") {
        return (
            <div className="flex items-center gap-1.5 border border-dashed border-zinc-700 rounded-md px-3 py-2">
                <Clock className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs text-zinc-400">
                    Wait {step.wait_days}d
                </span>
            </div>
        );
    }

    if (step.type === "condition") {
        return (
            <div className="flex items-center gap-1.5 border border-zinc-800/50 rounded-md px-3 py-2 bg-zinc-900/50">
                <Filter className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs text-zinc-400 capitalize">
                    {step.condition?.replace(/_/g, " ") || "Condition"}
                </span>
            </div>
        );
    }

    return null;
}

const LEAD_STATE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    active: { icon: <Zap className="w-4 h-4" />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    replied: { icon: <MessageSquare className="w-4 h-4" />, color: "text-purple-400", bg: "bg-purple-500/10" },
    bounced: { icon: <RotateCcw className="w-4 h-4" />, color: "text-red-400", bg: "bg-red-500/10" },
    unsubscribed: { icon: <Ban className="w-4 h-4" />, color: "text-orange-400", bg: "bg-orange-500/10" },
    completed: { icon: <CheckCircle2 className="w-4 h-4" />, color: "text-blue-400", bg: "bg-blue-500/10" },
    pending: { icon: <Clock className="w-4 h-4" />, color: "text-zinc-400", bg: "bg-zinc-500/10" },
    failed: { icon: <XCircle className="w-4 h-4" />, color: "text-red-400", bg: "bg-red-500/10" },
};
