"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
    Zap, Mail, Globe, Shield, Plus, ArrowRight, ChevronLeft,
    Flame, Pause, Play, BarChart3, TrendingUp, CheckCircle2,
    AlertTriangle, XCircle, Users, Send, Eye, MessageSquare,
    Clock, Activity, RotateCcw, Target, Sparkles, X, Loader2,
    ChevronRight, MoreHorizontal, ArrowUpRight, Trash2, Power,
    Settings, RefreshCw, Copy, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
}

interface DnsRecord {
    name: string;
    status: string;
    host: string;
    type: string;
    value: string;
    instruction: string;
    priority: string;
}

interface Domain {
    id: string;
    domain: string;
    provider: string;
    dns: { spf: string; dkim: string; dmarc: string; dmarc_policy: string | null };
    dns_records?: DnsRecord[];
    health: string;
    health_score: number;
    reputation_trend: string;
    can_send: boolean;
    block_reason: string | null;
    daily_sent: number;
    daily_limit: number;
    domain_age_days: number;
    blacklist_status: string;
    connected_at: string;
    inboxes: Inbox[];
}

interface Inbox {
    id: string;
    domain_id: string;
    email: string;
    display_name: string;
    warmup_level: string;
    warmup_day: number;
    daily_limit: number;
    daily_sent: number;
    health: string;
    health_score: number;
    bounce_rate: number;
    reply_rate: number;
    open_rate: number;
    is_active: boolean;
}

interface Campaign {
    id: string;
    name: string;
    status: string;
    send_mode: string;
    lead_count: number;
    lead_source: string;
    steps: { id: string; step_number: number; type: string; sent: number; wait_days: number; condition: string | null }[];
    inbox_ids: string[];
    stats: {
        total_sent: number; total_opened: number; total_replied: number;
        total_bounced: number; positive_replies: number; credits_refunded: number;
        total_leads: number; total_delivered: number; total_unsubscribed: number;
        credits_used: number;
    };
}

export default function OutreachDashboard() {
    const [domains, setDomains] = useState<Domain[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [activeTab, setActiveTab] = useState<'overview' | 'domains' | 'campaigns'>('overview');
    const [loading, setLoading] = useState(true);

    const [showAddDomain, setShowAddDomain] = useState(false);
    const [showAddInbox, setShowAddInbox] = useState<string | null>(null); // domain_id
    const [saving, setSaving] = useState(false);
    const [expandedDns, setExpandedDns] = useState<string | null>(null); // domain_id for expanded DNS records
    const [recheckingDns, setRecheckingDns] = useState<string | null>(null);

    const [newDomain, setNewDomain] = useState('');
    const [newProvider, setNewProvider] = useState('google');
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpPort, setSmtpPort] = useState('587');
    const [smtpUser, setSmtpUser] = useState('');
    const [smtpPass, setSmtpPass] = useState('');

    const [newInboxEmail, setNewInboxEmail] = useState('');
    const [newInboxName, setNewInboxName] = useState('');
    const [newInboxLimit, setNewInboxLimit] = useState('20');
    const [newInboxSmtpUser, setNewInboxSmtpUser] = useState('');
    const [newInboxSmtpPass, setNewInboxSmtpPass] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [domainsRes, campaignsRes] = await Promise.all([
                fetch('/api/outreach/domains'),
                fetch('/api/outreach/campaigns'),
            ]);
            if (domainsRes.ok) {
                const d = await domainsRes.json();
                setDomains(d.domains || []);
            }
            if (campaignsRes.ok) {
                const c = await campaignsRes.json();
                setCampaigns(c.campaigns || []);
            }
        } catch (e) {
            console.error('Failed to fetch outreach data:', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // --- Add Domain ---
    const handleAddDomain = async () => {
        if (!newDomain.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/outreach/domains', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: newDomain.trim(),
                    provider: newProvider,
                    ...(['smtp', 'hostinger', 'godaddy', 'other'].includes(newProvider) && smtpHost ? {
                        smtp_host: smtpHost || (newProvider === 'hostinger' ? 'smtp.hostinger.com' : ''),
                        smtp_port: parseInt(smtpPort) || (newProvider === 'hostinger' || newProvider === 'godaddy' ? 465 : 587),
                        smtp_user: smtpUser, smtp_pass: smtpPass,
                    } : {}),
                }),
            });
            if (res.ok) {
                setShowAddDomain(false);
                setNewDomain(''); setSmtpHost(''); setSmtpUser(''); setSmtpPass('');
                fetchData();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to connect domain');
            }
        } catch { alert('Network error'); }
        setSaving(false);
    };

    // --- Delete Domain ---
    const handleDeleteDomain = async (id: string) => {
        if (!confirm('Remove this domain and all its inboxes?')) return;
        await fetch(`/api/outreach/domains?id=${id}`, { method: 'DELETE' });
        fetchData();
    };

    // --- Add Inbox ---
    const handleAddInbox = async () => {
        if (!showAddInbox || !newInboxEmail.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/outreach/inboxes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain_id: showAddInbox,
                    email: newInboxEmail.trim(),
                    display_name: newInboxName.trim(),
                    daily_limit: parseInt(newInboxLimit) || 20,
                    smtp_user: newInboxSmtpUser || null,
                    smtp_pass: newInboxSmtpPass || null,
                }),
            });
            if (res.ok) {
                setShowAddInbox(null);
                setNewInboxEmail(''); setNewInboxName(''); setNewInboxLimit('20');
                setNewInboxSmtpUser(''); setNewInboxSmtpPass('');
                fetchData();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to add inbox');
            }
        } catch { alert('Network error'); }
        setSaving(false);
    };

    // --- Toggle Inbox Active ---
    const toggleInboxActive = async (inbox: Inbox) => {
        await fetch('/api/outreach/inboxes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: inbox.id, is_active: !inbox.is_active }),
        });
        fetchData();
    };

    // --- Delete Inbox ---
    const handleDeleteInbox = async (id: string) => {
        if (!confirm('Remove this inbox?')) return;
        await fetch(`/api/outreach/inboxes?id=${id}`, { method: 'DELETE' });
        fetchData();
    };

    // --- Delete Campaign ---
    const handleDeleteCampaign = async (id: string) => {
        if (!confirm('Delete this campaign?')) return;
        await fetch(`/api/outreach/campaigns?id=${id}`, { method: 'DELETE' });
        fetchData();
    };

    // --- Re-check DNS ---
    const handleRecheckDns = async (domainId: string) => {
        setRecheckingDns(domainId);
        try {
            const res = await fetch('/api/outreach/domains', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: domainId }),
            });
            if (res.ok) {
                await fetchData();
                setExpandedDns(domainId);
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to re-check DNS');
            }
        } catch { alert('Network error'); }
        setRecheckingDns(null);
    };

    // --- Copy to clipboard ---
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const el = document.createElement('textarea');
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        }
    };

    // Aggregate stats
    const totalSent = campaigns.reduce((a, c) => a + (c.stats?.total_sent || 0), 0);
    const totalReplied = campaigns.reduce((a, c) => a + (c.stats?.total_replied || 0), 0);
    const totalOpened = campaigns.reduce((a, c) => a + (c.stats?.total_opened || 0), 0);
    const totalBounced = campaigns.reduce((a, c) => a + (c.stats?.total_bounced || 0), 0);
    const totalRefunded = campaigns.reduce((a, c) => a + (c.stats?.credits_refunded || 0), 0);
    const positiveReplies = campaigns.reduce((a, c) => a + (c.stats?.positive_replies || 0), 0);
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const totalInboxes = domains.reduce((a, d) => a + (d.inboxes?.length || 0), 0);
    const activeInboxes = domains.reduce((a, d) => a + (d.inboxes?.filter(i => i.is_active)?.length || 0), 0);
    const overallReplyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : '0';
    const overallOpenRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0';
    const overallBounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : '0';

    return (
        <div className="min-h-screen bg-background">
            {/* Nav */}
            <nav className="border-b border-border bg-[#0a0a0d] px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/" className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg shadow-primary/20">
                            <Zap className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-bold tracking-tight">LeadBase</span>
                    </Link>
                    <Separator orientation="vertical" className="h-5" />
                    <div className="flex items-center gap-1">
                        <Send className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold">Outreach</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/">
                        <Button variant="ghost" size="sm" className="text-xs">
                            <ChevronLeft className="w-3 h-3 mr-1" /> Leads
                        </Button>
                    </Link>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={fetchData}>
                        <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                    </Button>
                    <Link href="/outreach/campaigns/new">
                        <Button size="sm" className="text-xs bg-primary hover:bg-primary/80">
                            <Plus className="w-3 h-3 mr-1.5" /> New Campaign
                        </Button>
                    </Link>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-6 py-6">
                {/* Tabs */}
                <div className="flex items-center gap-1 mb-6 border-b border-border">
                    {[
                        { key: 'overview' as const, label: 'Overview', icon: <BarChart3 className="w-3.5 h-3.5" /> },
                        { key: 'domains' as const, label: 'Domains & Inboxes', icon: <Globe className="w-3.5 h-3.5" /> },
                        { key: 'campaigns' as const, label: 'Campaigns', icon: <Send className="w-3.5 h-3.5" /> },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'
                                }`}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-24 gap-3">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading outreach data...</span>
                    </div>
                ) : (
                    <>
                        {/* ======== OVERVIEW TAB ======== */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6 animate-slide-up">
                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {[
                                        { label: 'Emails Sent', value: formatNumber(totalSent), icon: <Send className="w-4 h-4" />, color: 'text-primary' },
                                        { label: 'Open Rate', value: `${overallOpenRate}%`, icon: <Eye className="w-4 h-4" />, color: 'text-blue-400' },
                                        { label: 'Reply Rate', value: `${overallReplyRate}%`, icon: <MessageSquare className="w-4 h-4" />, color: 'text-green-400' },
                                        { label: 'Positive Replies', value: positiveReplies.toString(), icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400' },
                                        { label: 'Bounce Rate', value: `${overallBounceRate}%`, icon: <AlertTriangle className="w-4 h-4" />, color: totalBounced > 0 ? 'text-amber-400' : 'text-green-400' },
                                        { label: 'Credits Refunded', value: totalRefunded.toString(), icon: <RotateCcw className="w-4 h-4" />, color: 'text-purple-400' },
                                    ].map((stat, i) => (
                                        <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
                                            <div className={`${stat.color} mb-2`}>{stat.icon}</div>
                                            <div className="text-xl font-bold tabular-nums">{stat.value}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{stat.label}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Infrastructure + Campaigns */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-semibold">Infrastructure</h3>
                                            {domains.length > 0 ? (
                                                <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400 bg-green-500/10">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 animate-pulse" /> Active
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10">
                                                    Setup Required
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="space-y-2.5">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Connected Domains</span>
                                                <span className="font-medium">{domains.length}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Active Inboxes</span>
                                                <span className="font-medium">{activeInboxes}/{totalInboxes}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Active Campaigns</span>
                                                <span className="font-medium">{activeCampaigns}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Sending Capacity</span>
                                                <span className="font-medium">{domains.reduce((a, d) => a + (d.daily_limit || 0), 0)}/day</span>
                                            </div>
                                        </div>
                                        {domains.length === 0 && (
                                            <Button size="sm" className="mt-4 w-full text-xs bg-primary hover:bg-primary/80" onClick={() => { setActiveTab('domains'); setShowAddDomain(true); }}>
                                                <Plus className="w-3 h-3 mr-1.5" /> Connect Your First Domain
                                            </Button>
                                        )}
                                    </div>

                                    <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5 col-span-2">
                                        <h3 className="text-sm font-semibold mb-3">Campaigns</h3>
                                        {campaigns.length > 0 ? (
                                            <div className="space-y-2.5">
                                                {campaigns.slice(0, 4).map(camp => (
                                                    <div key={camp.id} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${camp.status === 'active' ? 'bg-green-400 animate-pulse' : camp.status === 'completed' ? 'bg-blue-400' : 'bg-muted-foreground/30'
                                                                }`} />
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-medium truncate">{camp.name}</div>
                                                                <div className="text-[10px] text-muted-foreground">
                                                                    {camp.stats?.total_sent || 0} sent · {camp.lead_count} leads · {camp.status}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Badge variant="outline" className={`text-[9px] ${camp.status === 'active' ? 'border-green-500/30 text-green-400' :
                                                            camp.status === 'completed' ? 'border-blue-500/30 text-blue-400' :
                                                                'border-white/10 text-muted-foreground'
                                                            }`}>
                                                            {camp.status.toUpperCase()}
                                                        </Badge>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8">
                                                <Send className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                                                <p className="text-sm text-muted-foreground">No campaigns yet</p>
                                                <Link href="/outreach/campaigns/new">
                                                    <Button size="sm" className="mt-3 text-xs bg-primary hover:bg-primary/80">
                                                        <Plus className="w-3 h-3 mr-1.5" /> Create Campaign
                                                    </Button>
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ======== DOMAINS TAB ======== */}
                        {activeTab === 'domains' && (
                            <div className="space-y-5 animate-slide-up">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-bold">Domains & Inboxes</h2>
                                        <p className="text-xs text-muted-foreground mt-0.5">Connect real sending domains and manage your inbox pool</p>
                                    </div>
                                    <Button size="sm" className="text-xs bg-primary hover:bg-primary/80" onClick={() => setShowAddDomain(true)}>
                                        <Plus className="w-3 h-3 mr-1.5" /> Connect Domain
                                    </Button>
                                </div>

                                {/* Empty state */}
                                {domains.length === 0 && !showAddDomain && (
                                    <div className="text-center py-16 bg-white/[0.01] border border-white/[0.04] rounded-xl">
                                        <Globe className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                                        <h3 className="text-base font-semibold mb-1">No domains connected</h3>
                                        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                                            Connect your sending domain to start outreach. We&apos;ll check DNS records automatically.
                                        </p>
                                        <Button className="bg-primary hover:bg-primary/80" onClick={() => setShowAddDomain(true)}>
                                            <Plus className="w-4 h-4 mr-2" /> Connect Your First Domain
                                        </Button>
                                    </div>
                                )}

                                {/* Domain Cards */}
                                {domains.map(domain => (
                                    <div key={domain.id} className="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden">
                                        {/* Domain Header */}
                                        <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.04]">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${domain.provider === 'google' ? 'bg-blue-500/10' : domain.provider === 'microsoft' ? 'bg-cyan-500/10' : domain.provider === 'hostinger' ? 'bg-indigo-500/10' : 'bg-white/[0.04]'
                                                    }`}>
                                                    {domain.provider === 'google' ? <Mail className="w-5 h-5 text-blue-400" /> :
                                                        domain.provider === 'microsoft' ? <Mail className="w-5 h-5 text-cyan-400" /> :
                                                            domain.provider === 'hostinger' ? <Mail className="w-5 h-5 text-indigo-400" /> :
                                                                <Globe className="w-5 h-5 text-muted-foreground" />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold">{domain.domain}</span>
                                                        <Badge variant="outline" className={`text-[9px] ${domain.health_score >= 80 ? 'border-green-500/30 text-green-400 bg-green-500/5' :
                                                            domain.health_score >= 60 ? 'border-blue-500/30 text-blue-400 bg-blue-500/5' :
                                                                domain.health_score >= 40 ? 'border-amber-500/30 text-amber-400 bg-amber-500/5' :
                                                                    'border-red-500/30 text-red-400 bg-red-500/5'
                                                            }`}>
                                                            {domain.health_score}% Health
                                                        </Badge>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                                                        {domain.provider} · {domain.inboxes?.length || 0} inbox{(domain.inboxes?.length || 0) !== 1 ? 'es' : ''}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {/* DNS Badges */}
                                                <div className="flex items-center gap-1.5">
                                                    {(['spf', 'dkim', 'dmarc'] as const).map(record => (
                                                        <div key={record} className={`flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${domain.dns[record] === 'valid' ? 'bg-green-500/10 text-green-400' :
                                                            domain.dns[record] === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                                                                domain.dns[record] === 'missing' ? 'bg-red-500/10 text-red-400' :
                                                                    'bg-white/[0.04] text-muted-foreground'
                                                            }`}>
                                                            {domain.dns[record] === 'valid' ? <CheckCircle2 className="w-2.5 h-2.5" /> :
                                                                domain.dns[record] === 'warning' ? <AlertTriangle className="w-2.5 h-2.5" /> :
                                                                    <XCircle className="w-2.5 h-2.5" />}
                                                            {record}
                                                        </div>
                                                    ))}
                                                </div>

                                                {domain.can_send ? (
                                                    <Badge className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20">
                                                        <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Can Send
                                                    </Badge>
                                                ) : (
                                                    <Badge className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20">
                                                        <XCircle className="w-2.5 h-2.5 mr-0.5" /> Blocked
                                                    </Badge>
                                                )}

                                                <Button variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground/60 hover:text-primary"
                                                    onClick={() => handleRecheckDns(domain.id)}
                                                    disabled={recheckingDns === domain.id}>
                                                    <RefreshCw className={`w-3 h-3 mr-1 ${recheckingDns === domain.id ? 'animate-spin' : ''}`} />
                                                    {recheckingDns === domain.id ? 'Checking...' : 'Re-check DNS'}
                                                </Button>

                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-red-400"
                                                    onClick={() => handleDeleteDomain(domain.id)}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Block Reason */}
                                        {domain.block_reason && (
                                            <div className="px-5 py-2.5 bg-red-500/5 border-b border-red-500/10 text-xs text-red-400 flex items-center gap-2">
                                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                                {domain.block_reason}
                                            </div>
                                        )}

                                        {/* DNS Records Panel */}
                                        {domain.dns_records && domain.dns_records.some(r => r.status !== 'valid') && (
                                            <div className="border-b border-white/[0.04]">
                                                <button
                                                    onClick={() => setExpandedDns(expandedDns === domain.id ? null : domain.id)}
                                                    className="w-full px-5 py-2.5 bg-amber-500/[0.03] hover:bg-amber-500/[0.05] transition-colors flex items-center justify-between text-xs text-amber-400">
                                                    <div className="flex items-center gap-2">
                                                        <Shield className="w-3.5 h-3.5" />
                                                        <span className="font-medium">DNS records need attention — click to see required records</span>
                                                    </div>
                                                    {expandedDns === domain.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                </button>

                                                {expandedDns === domain.id && (
                                                    <div className="px-5 py-4 space-y-3 bg-white/[0.01]">
                                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Required DNS Records</div>
                                                        {domain.dns_records.map((rec) => (
                                                            <div key={rec.name} className={`rounded-xl border p-4 ${rec.status === 'valid' ? 'border-green-500/10 bg-green-500/[0.02]' :
                                                                rec.status === 'missing' ? 'border-red-500/10 bg-red-500/[0.02]' :
                                                                    'border-amber-500/10 bg-amber-500/[0.02]'
                                                                }`}>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        {rec.status === 'valid' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> :
                                                                            rec.status === 'missing' ? <XCircle className="w-3.5 h-3.5 text-red-400" /> :
                                                                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                                                                        <span className="text-xs font-bold">{rec.name}</span>
                                                                        <Badge variant="outline" className={`text-[8px] ${rec.priority === 'critical' ? 'border-red-500/30 text-red-400' :
                                                                            rec.priority === 'recommended' ? 'border-amber-500/30 text-amber-400' :
                                                                                'border-green-500/30 text-green-400'
                                                                            }`}>
                                                                            {rec.priority === 'ok' ? 'Configured' : rec.priority.toUpperCase()}
                                                                        </Badge>
                                                                    </div>
                                                                </div>

                                                                <p className="text-[11px] text-muted-foreground mb-3">{rec.instruction}</p>

                                                                {rec.status !== 'valid' && (
                                                                    <div className="space-y-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold w-12">Host</span>
                                                                            <div className="flex-1 flex items-center gap-1.5">
                                                                                <code className="flex-1 text-[10px] bg-black/30 border border-white/[0.06] rounded px-2.5 py-1.5 text-blue-300 font-mono break-all">
                                                                                    {rec.host}
                                                                                </code>
                                                                                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 text-muted-foreground/40 hover:text-primary"
                                                                                    onClick={() => copyToClipboard(rec.host)}>
                                                                                    <Copy className="w-3 h-3" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold w-12">Type</span>
                                                                            <code className="text-[10px] bg-black/30 border border-white/[0.06] rounded px-2.5 py-1.5 text-purple-300 font-mono">
                                                                                {rec.type}
                                                                            </code>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold w-12">Value</span>
                                                                            <div className="flex-1 flex items-center gap-1.5">
                                                                                <code className="flex-1 text-[10px] bg-black/30 border border-white/[0.06] rounded px-2.5 py-1.5 text-emerald-300 font-mono break-all leading-relaxed">
                                                                                    {rec.value}
                                                                                </code>
                                                                                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 text-muted-foreground/40 hover:text-primary"
                                                                                    onClick={() => copyToClipboard(rec.value)}>
                                                                                    <Copy className="w-3 h-3" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}

                                                        <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 text-[11px] text-blue-400 flex items-start gap-2 mt-2">
                                                            <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                                            <div>After adding these records to your DNS provider, click <strong>Re-check DNS</strong> above. DNS propagation typically takes 5–30 minutes, but can take up to 48 hours.</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Inboxes */}
                                        <div className="px-5 py-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                                    Inbox Pool ({domain.inboxes?.length || 0})
                                                </span>
                                                <Button variant="ghost" size="sm" className="text-[10px] h-6 text-primary hover:bg-primary/10"
                                                    onClick={() => setShowAddInbox(domain.id)}>
                                                    <Plus className="w-2.5 h-2.5 mr-0.5" /> Add Inbox
                                                </Button>
                                            </div>

                                            {domain.inboxes?.length > 0 ? (
                                                <div className="grid gap-2">
                                                    {domain.inboxes.map(inbox => (
                                                        <div key={inbox.id} className="flex items-center justify-between py-2.5 px-3 bg-white/[0.02] rounded-lg border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-2 h-2 rounded-full ${inbox.is_active ? 'bg-green-400' : 'bg-muted-foreground/30'}`} />
                                                                <div>
                                                                    <div className="text-xs font-medium">{inbox.email}</div>
                                                                    <div className="text-[10px] text-muted-foreground">
                                                                        {inbox.display_name || 'No display name'} · {inbox.warmup_level} · day {inbox.warmup_day}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
                                                                    <span>Limit: {inbox.daily_limit}/day</span>
                                                                </div>
                                                                <Badge variant="outline" className={`text-[9px] min-w-[60px] justify-center ${inbox.health_score >= 80 ? 'border-green-500/30 text-green-400' :
                                                                    inbox.health_score >= 50 ? 'border-amber-500/30 text-amber-400' :
                                                                        'border-red-500/30 text-red-400'
                                                                    }`}>
                                                                    {inbox.health_score}%
                                                                </Badge>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6" title={inbox.is_active ? 'Deactivate' : 'Activate'}
                                                                    onClick={() => toggleInboxActive(inbox)}>
                                                                    <Power className={`w-3 h-3 ${inbox.is_active ? 'text-green-400' : 'text-muted-foreground/30'}`} />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/40 hover:text-red-400"
                                                                    onClick={() => handleDeleteInbox(inbox.id)}>
                                                                    <Trash2 className="w-3 h-3" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-5 text-xs text-muted-foreground">
                                                    No inboxes yet. Add one to start sending.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ======== CAMPAIGNS TAB ======== */}
                        {activeTab === 'campaigns' && (
                            <div className="space-y-5 animate-slide-up">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-bold">Campaigns</h2>
                                        <p className="text-xs text-muted-foreground mt-0.5">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
                                    </div>
                                    <Link href="/outreach/campaigns/new">
                                        <Button size="sm" className="text-xs bg-primary hover:bg-primary/80">
                                            <Plus className="w-3 h-3 mr-1.5" /> New Campaign
                                        </Button>
                                    </Link>
                                </div>

                                {campaigns.length === 0 ? (
                                    <div className="text-center py-16 bg-white/[0.01] border border-white/[0.04] rounded-xl">
                                        <Send className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                                        <h3 className="text-base font-semibold mb-1">No campaigns yet</h3>
                                        <p className="text-sm text-muted-foreground mb-4">Create your first outreach campaign</p>
                                        <Link href="/outreach/campaigns/new">
                                            <Button className="bg-primary hover:bg-primary/80">
                                                <Plus className="w-4 h-4 mr-2" /> Create Campaign
                                            </Button>
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {campaigns.map(camp => {
                                            const replyRate = (camp.stats?.total_sent || 0) > 0 ? (((camp.stats?.total_replied || 0) / camp.stats.total_sent) * 100).toFixed(1) : '—';
                                            const openRate = (camp.stats?.total_sent || 0) > 0 ? (((camp.stats?.total_opened || 0) / camp.stats.total_sent) * 100).toFixed(1) : '—';
                                            const emailSteps = (camp.steps || []).filter(s => s.type === 'email').length;

                                            return (
                                                <div key={camp.id} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5 hover:border-white/[0.1] transition-colors cursor-pointer" onClick={() => window.location.href = `/outreach/campaigns/${camp.id}`}>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-3 h-3 rounded-full ${camp.status === 'active' ? 'bg-green-400 animate-pulse' :
                                                                camp.status === 'completed' ? 'bg-blue-400' :
                                                                    camp.status === 'draft' ? 'bg-muted-foreground/20' : 'bg-amber-400'
                                                                }`} />
                                                            <div>
                                                                <h3 className="text-sm font-semibold">{camp.name}</h3>
                                                                <p className="text-[10px] text-muted-foreground">
                                                                    {camp.lead_count} leads · {emailSteps}-step · {camp.send_mode} mode · {camp.lead_source || 'No source'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className={`text-[9px] uppercase ${camp.status === 'active' ? 'border-green-500/30 text-green-400 bg-green-500/5' :
                                                                camp.status === 'completed' ? 'border-blue-500/30 text-blue-400 bg-blue-500/5' :
                                                                    'border-white/10 text-muted-foreground'
                                                                }`}>
                                                                {camp.status}
                                                            </Badge>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/40 hover:text-red-400"
                                                                onClick={() => handleDeleteCampaign(camp.id)}>
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {(camp.stats?.total_sent || 0) > 0 && (
                                                        <div className="grid grid-cols-5 gap-3">
                                                            {[
                                                                { label: 'Sent', value: camp.stats.total_sent },
                                                                { label: 'Opened', value: `${openRate}%` },
                                                                { label: 'Replied', value: `${replyRate}%` },
                                                                { label: 'Bounced', value: camp.stats.total_bounced },
                                                                { label: 'Refunded', value: camp.stats.credits_refunded },
                                                            ].map((s, i) => (
                                                                <div key={i} className="bg-white/[0.02] rounded-lg p-2 text-center border border-white/[0.03]">
                                                                    <div className="text-sm font-bold tabular-nums">{s.value}</div>
                                                                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Sequence viz */}
                                                    {camp.steps && camp.steps.length > 0 && (
                                                        <div className="mt-3 flex items-center gap-1.5">
                                                            {camp.steps.map((s, i) => (
                                                                <div key={s.id} className="flex items-center gap-1.5">
                                                                    <div className={`px-2 py-1 rounded text-[9px] border ${s.type === 'email' ? 'bg-primary/5 border-primary/10 text-primary' :
                                                                        s.type === 'wait' ? 'bg-white/[0.02] border-white/[0.04] text-muted-foreground' :
                                                                            'bg-amber-500/5 border-amber-500/10 text-amber-400'
                                                                        }`}>
                                                                        {s.type === 'email' ? <Mail className="w-2.5 h-2.5 inline mr-0.5" /> :
                                                                            s.type === 'wait' ? <Clock className="w-2.5 h-2.5 inline mr-0.5" /> :
                                                                                <Target className="w-2.5 h-2.5 inline mr-0.5" />}
                                                                        {s.type === 'email' ? `Email` : s.type === 'wait' ? `${s.wait_days}d` : 'If'}
                                                                    </div>
                                                                    {i < camp.steps.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/20" />}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ======== ADD DOMAIN MODAL ======== */}
            {showAddDomain && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddDomain(false)} />
                    <div className="relative w-full max-w-lg bg-[#0f0f12] border border-white/[0.08] rounded-2xl p-6 shadow-2xl animate-scale-in">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-base font-bold">Connect Domain</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">We&apos;ll auto-check SPF, DKIM, and DMARC records</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAddDomain(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        <div className="space-y-4">
                            {/* Domain */}
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">Domain</label>
                                <Input placeholder="mail.yourdomain.com" value={newDomain} onChange={e => setNewDomain(e.target.value)}
                                    className="h-9 text-sm bg-white/[0.03]" />
                            </div>

                            {/* Email Provider */}
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Email Service Provider</label>
                                <p className="text-[10px] text-muted-foreground/60 mb-2">Where does your email run? (Not your domain registrar — e.g. if you bought from GoDaddy but use Gmail, select Google Workspace)</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        { key: 'google', label: 'Google Workspace', sub: 'Gmail / G Suite', color: 'border-blue-500/30 bg-blue-500/5' },
                                        { key: 'microsoft', label: 'Microsoft 365', sub: 'Outlook / Exchange', color: 'border-cyan-500/30 bg-cyan-500/5' },
                                        { key: 'zoho', label: 'Zoho Mail', sub: 'Zoho Workplace', color: 'border-yellow-500/30 bg-yellow-500/5' },
                                        { key: 'hostinger', label: 'Hostinger Email', sub: 'Hostinger email hosting', color: 'border-indigo-500/30 bg-indigo-500/5' },
                                        { key: 'godaddy', label: 'GoDaddy Email', sub: 'GoDaddy workspace emails', color: 'border-green-500/30 bg-green-500/5' },
                                        { key: 'smtp', label: 'Custom SMTP', sub: 'Any SMTP / IMAP provider', color: 'border-white/10 bg-white/[0.02]' },
                                        { key: 'other', label: 'Other / Not Sure', sub: 'Just check DNS for now', color: 'border-purple-500/30 bg-purple-500/5' },
                                    ]).map(p => (
                                        <button key={p.key} onClick={() => setNewProvider(p.key)}
                                            className={`p-3 rounded-xl border text-left transition-all ${newProvider === p.key ? p.color : 'border-white/[0.06] hover:border-white/[0.1]'
                                                }`}>
                                            <div className="text-xs font-semibold">{p.label}</div>
                                            <div className="text-[10px] text-muted-foreground/50 mt-0.5">{p.sub}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* SMTP fields — show for smtp, godaddy, hostinger, other */}
                            {['smtp', 'godaddy', 'hostinger', 'other'].includes(newProvider) && (
                                <div className="space-y-3 bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                                        SMTP Settings {!['smtp', 'hostinger'].includes(newProvider) && <span className="normal-case font-normal">(optional — fill in if you want to send emails)</span>}
                                    </div>
                                    {newProvider === 'hostinger' && (
                                        <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-2.5 text-[11px] text-indigo-400 flex items-start gap-2 mb-1">
                                            <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                            <div>Hostinger SMTP is pre-filled. Use your Hostinger email address as the username and your email password.</div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input placeholder={newProvider === 'godaddy' ? 'smtpout.secureserver.net' : newProvider === 'hostinger' ? 'smtp.hostinger.com' : 'smtp.yourdomain.com'} value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="h-8 text-xs bg-white/[0.02]" />
                                        <Input placeholder={newProvider === 'godaddy' ? '465' : newProvider === 'hostinger' ? '465' : '587'} value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className="h-8 text-xs bg-white/[0.02]" />
                                    </div>
                                    <Input placeholder={newProvider === 'hostinger' ? 'your@email.com (Hostinger email)' : 'SMTP Username (usually your email)'} value={smtpUser} onChange={e => setSmtpUser(e.target.value)} className="h-8 text-xs bg-white/[0.02]" />
                                    <Input placeholder={newProvider === 'hostinger' ? 'Email password' : 'SMTP Password / App Password'} type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} className="h-8 text-xs bg-white/[0.02]" />
                                </div>
                            )}

                            <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 text-xs text-blue-400 flex items-start gap-2">
                                <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <div>
                                    <strong>It doesn&apos;t matter where you bought the domain</strong> (GoDaddy, Namecheap, Cloudflare, etc.)
                                    — we check your DNS records directly. After connecting, we&apos;ll show you exactly what TXT records to add.
                                </div>
                            </div>

                            <Button className="w-full bg-primary hover:bg-primary/80" onClick={handleAddDomain} disabled={!newDomain.trim() || saving}>
                                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
                                {saving ? 'Connecting & Checking DNS...' : 'Connect Domain'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ======== ADD INBOX MODAL ======== */}
            {showAddInbox && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddInbox(null)} />
                    <div className="relative w-full max-w-md bg-[#0f0f12] border border-white/[0.08] rounded-2xl p-6 shadow-2xl animate-scale-in">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-base font-bold">Add Inbox</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Add a sending mailbox to this domain</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAddInbox(null)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">Email Address</label>
                                <Input placeholder="john@yourdomain.com" value={newInboxEmail} onChange={e => setNewInboxEmail(e.target.value)}
                                    className="h-9 text-sm bg-white/[0.03]" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">Display Name</label>
                                <Input placeholder="John Miller" value={newInboxName} onChange={e => setNewInboxName(e.target.value)}
                                    className="h-9 text-sm bg-white/[0.03]" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">Daily Send Limit</label>
                                <Input type="number" placeholder="20" value={newInboxLimit} onChange={e => setNewInboxLimit(e.target.value)}
                                    className="h-9 text-sm bg-white/[0.03]" min={5} max={100} />
                                <p className="text-[10px] text-muted-foreground mt-1">Start low (20-30) for new inboxes. Increase as warmup progresses.</p>
                            </div>

                            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 space-y-2">
                                <div className="text-xs font-semibold text-muted-foreground">SMTP Credentials (optional — only for custom SMTP)</div>
                                <Input placeholder="SMTP Username / Email" value={newInboxSmtpUser} onChange={e => setNewInboxSmtpUser(e.target.value)} className="h-8 text-xs bg-white/[0.02]" />
                                <Input placeholder="SMTP Password / App Password" type="password" value={newInboxSmtpPass} onChange={e => setNewInboxSmtpPass(e.target.value)} className="h-8 text-xs bg-white/[0.02]" />
                            </div>

                            <Button className="w-full bg-primary hover:bg-primary/80" onClick={handleAddInbox} disabled={!newInboxEmail.trim() || saving}>
                                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                                {saving ? 'Adding...' : 'Add Inbox'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
