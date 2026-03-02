"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
    Zap, ChevronLeft, ChevronRight, ArrowRight, Plus, X,
    Mail, Clock, Target, Send, Shield, Eye, MessageSquare,
    Sparkles, AlertTriangle, CheckCircle2, XCircle, Loader2,
    Play, Flame, Globe, Users, Settings,
    Trash2, BarChart3, Lock, Gauge, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { generateCampaignHealthCheck } from "@/lib/outreach-engine";
import type { CampaignStep, SendMode, CampaignHealthCheck } from "@/lib/outreach-types";

type WizardStep = 'leads' | 'sequence' | 'inboxes' | 'schedule' | 'health' | 'preview' | 'launch';

const WIZARD_STEPS: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
    { key: 'leads', label: 'Select Leads', icon: <Users className="w-4 h-4" /> },
    { key: 'sequence', label: 'Build Sequence', icon: <Mail className="w-4 h-4" /> },
    { key: 'inboxes', label: 'Inbox Pool', icon: <Globe className="w-4 h-4" /> },
    { key: 'schedule', label: 'Schedule', icon: <Clock className="w-4 h-4" /> },
    { key: 'health', label: 'Health Check', icon: <Shield className="w-4 h-4" /> },
    { key: 'preview', label: 'Preview', icon: <Eye className="w-4 h-4" /> },
    { key: 'launch', label: 'Launch', icon: <Send className="w-4 h-4" /> },
];

interface RealDomain {
    id: string;
    domain: string;
    provider: string;
    can_send: boolean;
    health_score: number;
    inboxes: RealInbox[];
}

interface RealInbox {
    id: string;
    domain_id: string;
    email: string;
    display_name: string;
    warmup_level: string;
    warmup_day: number;
    daily_limit: number;
    daily_sent: number;
    health_score: number;
    is_active: boolean;
}

interface LeadSource {
    name: string;
    count: number;
}

export default function CampaignBuilder() {
    const [step, setStep] = useState<WizardStep>('leads');
    const [campaignName, setCampaignName] = useState('');

    // Real data from API
    const [domains, setDomains] = useState<RealDomain[]>([]);
    const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    const [selectedLeadCount, setSelectedLeadCount] = useState(250);
    const [selectedSource, setSelectedSource] = useState('');
    const [sendMode, setSendMode] = useState<SendMode>('safe');
    const [selectedInboxes, setSelectedInboxes] = useState<string[]>([]);
    const [healthCheck, setHealthCheck] = useState<CampaignHealthCheck | null>(null);
    const [healthChecking, setHealthChecking] = useState(false);
    const [previewEmail, setPreviewEmail] = useState<Record<string, unknown> | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [launched, setLaunched] = useState(false);
    const [launching, setLaunching] = useState(false);

    // Sender info
    const [senderName, setSenderName] = useState('');
    const [senderCompany, setSenderCompany] = useState('');
    const [productDesc, setProductDesc] = useState('');
    const [valueProp, setValueProp] = useState('');

    // Schedule
    const [startHour, setStartHour] = useState(9);
    const [endHour, setEndHour] = useState(17);
    const [timezone, setTimezone] = useState('America/New_York');
    const [sendDays, setSendDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri']);

    // Sequence
    const [sequence, setSequence] = useState<CampaignStep[]>([
        { id: 'step-1', step_number: 1, type: 'email', subject_template: '', body_template: '', ai_personalize: true, tone: 'founder', wait_days: 0, condition: null, sent: 0, opened: 0, replied: 0, bounced: 0 },
        { id: 'step-2', step_number: 2, type: 'wait', subject_template: '', body_template: '', ai_personalize: false, tone: 'direct', wait_days: 3, condition: null, sent: 0, opened: 0, replied: 0, bounced: 0 },
        { id: 'step-3', step_number: 3, type: 'condition', subject_template: '', body_template: '', ai_personalize: false, tone: 'direct', wait_days: 0, condition: 'no_reply', sent: 0, opened: 0, replied: 0, bounced: 0 },
        { id: 'step-4', step_number: 4, type: 'email', subject_template: '', body_template: '', ai_personalize: true, tone: 'friendly', wait_days: 0, condition: null, sent: 0, opened: 0, replied: 0, bounced: 0 },
    ]);

    // Fetch real domains/inboxes and lead sources
    useEffect(() => {
        async function load() {
            setLoadingData(true);
            try {
                const [domainsRes, tablesRes] = await Promise.all([
                    fetch('/api/outreach/domains'),
                    fetch('/api/tables'),
                ]);
                if (domainsRes.ok) {
                    const d = await domainsRes.json();
                    setDomains(d.domains || []);
                }
                if (tablesRes.ok) {
                    const t = await tablesRes.json();
                    setLeadSources((t.tables || t || []).map((tbl: { table_name: string; row_count: number }) => ({
                        name: tbl.table_name, count: tbl.row_count,
                    })));
                }
            } catch (e) { console.error(e); }
            setLoadingData(false);
        }
        load();
    }, []);

    const stepIndex = WIZARD_STEPS.findIndex(s => s.key === step);
    const canNext = () => {
        if (step === 'leads') return selectedSource.length > 0 && selectedLeadCount > 0;
        if (step === 'sequence') return sequence.filter(s => s.type === 'email').length >= 1;
        if (step === 'inboxes') return selectedInboxes.length >= 1;
        if (step === 'schedule') return true;
        if (step === 'health') return healthCheck?.passed;
        if (step === 'preview') return true;
        return false;
    };

    const goNext = () => {
        if (stepIndex < WIZARD_STEPS.length - 1) {
            const next = WIZARD_STEPS[stepIndex + 1].key;
            if (next === 'health' && !healthCheck) runHealthCheck();
            if (next === 'preview' && !previewEmail) generatePreview();
            setStep(next);
        }
    };
    const goBack = () => { if (stepIndex > 0) setStep(WIZARD_STEPS[stepIndex - 1].key); };

    const runHealthCheck = async () => {
        setHealthChecking(true);
        await new Promise(r => setTimeout(r, 1200));
        setHealthCheck(generateCampaignHealthCheck(selectedLeadCount));
        setHealthChecking(false);
    };

    const generatePreview = async () => {
        setPreviewLoading(true);
        try {
            const res = await fetch('/api/email/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead: { name: 'Dave Jesurun', title: 'Founder, CEO', company: 'High Country Air Service', industry: 'Aviation', city: 'Texas' },
                    sender: { name: senderName || 'Alex', company: senderCompany || 'LeadBase', product_description: productDesc || 'Sales intelligence platform', value_proposition: valueProp || 'Find your best leads faster' },
                    tone: sequence.find(s => s.type === 'email')?.tone || 'direct',
                    step_number: 1,
                }),
            });
            if (res.ok) setPreviewEmail(await res.json());
        } catch { /* fallback */ }
        setPreviewLoading(false);
    };

    // Launch = save campaign to DB via API
    const handleLaunch = async () => {
        setLaunching(true);
        try {
            const res = await fetch('/api/outreach/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: campaignName || 'Untitled Campaign',
                    status: 'scheduled',
                    lead_source: selectedSource,
                    lead_count: selectedLeadCount,
                    send_mode: sendMode,
                    sender_name: senderName,
                    sender_company: senderCompany,
                    product_description: productDesc,
                    value_proposition: valueProp,
                    window_start_hour: startHour,
                    window_end_hour: endHour,
                    window_timezone: timezone,
                    window_days: sendDays,
                    max_per_hour_per_inbox: sendMode === 'safe' ? 8 : sendMode === 'moderate' ? 12 : 18,
                    min_interval_seconds: sendMode === 'safe' ? 240 : sendMode === 'moderate' ? 180 : 120,
                    max_interval_seconds: sendMode === 'safe' ? 480 : sendMode === 'moderate' ? 360 : 240,
                    steps: sequence.map((s, i) => ({
                        step_number: i + 1,
                        type: s.type,
                        subject_template: s.subject_template,
                        body_template: s.body_template,
                        ai_personalize: s.ai_personalize,
                        tone: s.tone,
                        wait_days: s.wait_days,
                        condition: s.condition,
                    })),
                    inbox_ids: selectedInboxes,
                    health_check_data: healthCheck,
                }),
            });
            if (res.ok) {
                setLaunched(true);
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to create campaign');
            }
        } catch { alert('Network error'); }
        setLaunching(false);
    };

    const addSequenceStep = (type: 'email' | 'wait' | 'condition') => {
        const newStep: CampaignStep = {
            id: `step-${Date.now()}`, step_number: sequence.length + 1, type,
            subject_template: '', body_template: '', ai_personalize: type === 'email',
            tone: 'direct', wait_days: type === 'wait' ? 3 : 0,
            condition: type === 'condition' ? 'no_reply' : null,
            sent: 0, opened: 0, replied: 0, bounced: 0,
        };
        setSequence([...sequence, newStep]);
    };

    const removeStep = (id: string) => setSequence(sequence.filter(s => s.id !== id));
    const toggleInbox = (id: string) => setSelectedInboxes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const toggleDay = (day: string) => setSendDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

    const allInboxes = domains.filter(d => d.can_send).flatMap(d => d.inboxes?.filter(i => i.is_active) || []);

    if (loadingData) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Nav */}
            <nav className="border-b border-border bg-[#0a0a0d] px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/outreach">
                        <Button variant="ghost" size="sm" className="text-xs"><ChevronLeft className="w-3 h-3 mr-1" /> Back</Button>
                    </Link>
                    <Separator orientation="vertical" className="h-5" />
                    <Input placeholder="Campaign name..." value={campaignName} onChange={e => setCampaignName(e.target.value)}
                        className="w-64 h-8 text-sm bg-transparent border-none focus-visible:ring-0 font-semibold placeholder:text-muted-foreground/40" />
                </div>
            </nav>

            {/* Progress */}
            <div className="border-b border-border bg-[#0b0b0e] px-6 py-3">
                <div className="max-w-5xl mx-auto flex items-center gap-1">
                    {WIZARD_STEPS.map((ws, i) => (
                        <div key={ws.key} className="flex items-center gap-1 flex-1">
                            <button onClick={() => i <= stepIndex ? setStep(ws.key) : undefined}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-1 ${ws.key === step ? 'bg-primary/10 text-primary border border-primary/20' :
                                    i < stepIndex ? 'bg-green-500/10 text-green-400 border border-green-500/15' :
                                        'bg-white/[0.02] text-muted-foreground border border-white/[0.04]'
                                    }`}>
                                {i < stepIndex ? <CheckCircle2 className="w-3.5 h-3.5" /> : ws.icon}
                                <span className="hidden lg:inline">{ws.label}</span>
                            </button>
                            {i < WIZARD_STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/20 flex-shrink-0" />}
                        </div>
                    ))}
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-6 py-8">

                {/* ===== STEP: LEADS ===== */}
                {step === 'leads' && (
                    <div className="space-y-6 animate-slide-up">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Select Your Leads</h2>
                            <p className="text-sm text-muted-foreground">Choose a lead table and how many contacts to include</p>
                        </div>

                        {leadSources.length === 0 ? (
                            <div className="text-center py-12 bg-white/[0.01] border border-white/[0.04] rounded-xl">
                                <Users className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
                                <p className="text-sm text-muted-foreground">No lead tables found in your database</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                                    {leadSources.map(source => (
                                        <button key={source.name} onClick={() => { setSelectedSource(source.name); setSelectedLeadCount(Math.min(500, source.count)); }}
                                            className={`text-left p-4 rounded-xl border transition-all ${selectedSource === source.name ? 'border-primary/30 bg-primary/[0.03]' : 'border-white/[0.06] bg-white/[0.01] hover:border-white/[0.1]'
                                                }`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-medium truncate pr-2">{source.name}</span>
                                                {selectedSource === source.name && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
                                            </div>
                                            <span className="text-xs text-muted-foreground">{source.count.toLocaleString()} leads</span>
                                        </button>
                                    ))}
                                </div>

                                {selectedSource && (
                                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Lead Count</label>
                                        <div className="flex items-center gap-4">
                                            <Input type="number" value={selectedLeadCount} onChange={e => setSelectedLeadCount(parseInt(e.target.value) || 0)}
                                                className="w-32 h-9 text-sm bg-white/[0.02]" min={1} max={10000} />
                                            <input type="range" value={selectedLeadCount} onChange={e => setSelectedLeadCount(parseInt(e.target.value))}
                                                min={50} max={Math.min(5000, leadSources.find(s => s.name === selectedSource)?.count || 2000)} step={50} className="flex-1 accent-primary" />
                                            <span className="text-sm text-muted-foreground tabular-nums">{selectedLeadCount.toLocaleString()}</span>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ===== STEP: SEQUENCE ===== */}
                {step === 'sequence' && (
                    <div className="space-y-6 animate-slide-up">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold mb-1">Build Your Sequence</h2>
                                <p className="text-sm text-muted-foreground">Design a multi-step outreach flow with AI personalization</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" className="text-xs" onClick={() => addSequenceStep('email')}><Mail className="w-3 h-3 mr-1" /> + Email</Button>
                                <Button variant="outline" size="sm" className="text-xs" onClick={() => addSequenceStep('wait')}><Clock className="w-3 h-3 mr-1" /> + Wait</Button>
                                <Button variant="outline" size="sm" className="text-xs" onClick={() => addSequenceStep('condition')}><Target className="w-3 h-3 mr-1" /> + Condition</Button>
                            </div>
                        </div>

                        {/* Sender Context */}
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                                <Settings className="w-3.5 h-3.5" /> Sender Context (for AI personalization)
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Input placeholder="Your name" value={senderName} onChange={e => setSenderName(e.target.value)} className="h-8 text-xs bg-white/[0.02]" />
                                <Input placeholder="Company name" value={senderCompany} onChange={e => setSenderCompany(e.target.value)} className="h-8 text-xs bg-white/[0.02]" />
                                <Input placeholder="What does your product do?" value={productDesc} onChange={e => setProductDesc(e.target.value)} className="h-8 text-xs bg-white/[0.02] col-span-2" />
                                <Input placeholder="What value do you deliver?" value={valueProp} onChange={e => setValueProp(e.target.value)} className="h-8 text-xs bg-white/[0.02] col-span-2" />
                            </div>
                        </div>

                        {/* Sequence Steps */}
                        <div className="space-y-2.5">
                            {sequence.map((s, i) => (
                                <div key={s.id} className="flex items-start gap-3">
                                    <div className="flex flex-col items-center pt-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${s.type === 'email' ? 'bg-primary/20 text-primary' : s.type === 'wait' ? 'bg-white/[0.06] text-muted-foreground' : 'bg-amber-500/20 text-amber-400'
                                            }`}>
                                            {s.type === 'email' ? <Mail className="w-3.5 h-3.5" /> : s.type === 'wait' ? <Clock className="w-3.5 h-3.5" /> : <Target className="w-3.5 h-3.5" />}
                                        </div>
                                        {i < sequence.length - 1 && <div className="w-px h-6 bg-white/[0.06] mt-1" />}
                                    </div>

                                    <div className={`flex-1 rounded-xl border p-4 ${s.type === 'email' ? 'border-primary/10 bg-primary/[0.02]' : s.type === 'condition' ? 'border-amber-500/10 bg-amber-500/[0.02]' : 'border-white/[0.05] bg-white/[0.01]'
                                        }`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                    {s.type === 'email' ? `Email ${sequence.filter((x, j) => j <= i && x.type === 'email').length}` : s.type === 'wait' ? 'Wait' : 'Condition'}
                                                </span>
                                                {s.type === 'email' && s.ai_personalize && (
                                                    <Badge className="text-[9px] bg-purple-500/10 text-purple-400 border-purple-500/20">
                                                        <Sparkles className="w-2.5 h-2.5 mr-0.5" /> AI Personalized
                                                    </Badge>
                                                )}
                                            </div>
                                            {sequence.length > 1 && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/50 hover:text-red-400" onClick={() => removeStep(s.id)}>
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            )}
                                        </div>

                                        {s.type === 'email' && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-muted-foreground w-12">Tone</span>
                                                    <div className="flex gap-1">
                                                        {(['direct', 'friendly', 'founder', 'formal'] as const).map(tone => (
                                                            <button key={tone} onClick={() => setSequence(seq => seq.map(x => x.id === s.id ? { ...x, tone } : x))}
                                                                className={`px-2 py-0.5 rounded text-[10px] capitalize transition-colors ${s.tone === tone ? 'bg-primary/20 text-primary border border-primary/20' : 'bg-white/[0.04] text-muted-foreground border border-transparent hover:border-white/[0.08]'
                                                                    }`}>{tone}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground/60">AI generates personalized subject + body using lead context and your product info.</p>
                                            </div>
                                        )}
                                        {s.type === 'wait' && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-muted-foreground">Wait</span>
                                                <Input type="number" value={s.wait_days} onChange={e => setSequence(seq => seq.map(x => x.id === s.id ? { ...x, wait_days: parseInt(e.target.value) || 1 } : x))}
                                                    className="w-16 h-7 text-xs bg-white/[0.02]" min={1} max={14} />
                                                <span className="text-[10px] text-muted-foreground">days</span>
                                            </div>
                                        )}
                                        {s.type === 'condition' && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-muted-foreground">Continue if</span>
                                                <select value={s.condition || 'no_reply'} onChange={e => setSequence(seq => seq.map(x => x.id === s.id ? { ...x, condition: e.target.value as 'no_reply' } : x))}
                                                    className="h-7 text-xs bg-white/[0.04] border border-white/[0.08] rounded px-2 text-foreground">
                                                    <option value="no_reply">No reply received</option>
                                                    <option value="opened">Email opened</option>
                                                    <option value="replied">Reply received</option>
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ===== STEP: INBOXES ===== */}
                {step === 'inboxes' && (
                    <div className="space-y-6 animate-slide-up">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Select Inbox Pool</h2>
                            <p className="text-sm text-muted-foreground">Choose which inboxes to distribute sending across</p>
                        </div>

                        {/* Send Mode */}
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Sending Mode</div>
                            <div className="grid grid-cols-3 gap-3">
                                {([
                                    { key: 'safe' as const, label: 'Safe', desc: '6-8/hr per inbox, max randomization', color: 'border-green-500/20 bg-green-500/5', icon: <Shield className="w-4 h-4 text-green-400" /> },
                                    { key: 'moderate' as const, label: 'Moderate', desc: '10-12/hr per inbox, balanced', color: 'border-amber-500/20 bg-amber-500/5', icon: <Gauge className="w-4 h-4 text-amber-400" /> },
                                    { key: 'aggressive' as const, label: 'Aggressive', desc: '15-20/hr. Only if fully warmed.', color: 'border-red-500/20 bg-red-500/5', icon: <Flame className="w-4 h-4 text-red-400" /> },
                                ]).map(mode => (
                                    <button key={mode.key} onClick={() => setSendMode(mode.key)}
                                        className={`p-3.5 rounded-xl border text-left transition-all ${sendMode === mode.key ? mode.color : 'border-white/[0.06] hover:border-white/[0.1]'}`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            {mode.icon}
                                            <span className="text-sm font-semibold">{mode.label}</span>
                                            {mode.key === 'safe' && <Badge className="text-[8px] bg-green-500/10 text-green-400 border-green-500/20">Recommended</Badge>}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">{mode.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Real Inboxes */}
                        {allInboxes.length === 0 ? (
                            <div className="text-center py-12 bg-white/[0.01] border border-white/[0.04] rounded-xl">
                                <Mail className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
                                <p className="text-sm text-muted-foreground mb-1">No active inboxes available</p>
                                <p className="text-xs text-muted-foreground mb-4">Connect a domain and add inboxes first</p>
                                <Link href="/outreach"><Button size="sm" className="text-xs">Go to Domains</Button></Link>
                            </div>
                        ) : (
                            domains.filter(d => d.can_send).map(domain => (
                                <div key={domain.id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
                                    <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Globe className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm font-semibold">{domain.domain}</span>
                                            <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400">{domain.health_score}%</Badge>
                                        </div>
                                    </div>
                                    <div className="p-3 space-y-2">
                                        {(domain.inboxes || []).filter(i => i.is_active).map(inbox => (
                                            <button key={inbox.id} onClick={() => toggleInbox(inbox.id)}
                                                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${selectedInboxes.includes(inbox.id) ? 'border-primary/20 bg-primary/[0.03]' : 'border-white/[0.04] hover:border-white/[0.08]'
                                                    }`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${selectedInboxes.includes(inbox.id) ? 'bg-primary border-primary' : 'border-white/[0.15]'
                                                        }`}>
                                                        {selectedInboxes.includes(inbox.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-medium">{inbox.email}</div>
                                                        <div className="text-[10px] text-muted-foreground">{inbox.warmup_level} · day {inbox.warmup_day} · {inbox.daily_limit - inbox.daily_sent} capacity left</div>
                                                    </div>
                                                </div>
                                                <span className={`text-[10px] font-medium ${inbox.health_score >= 70 ? 'text-green-400' : 'text-amber-400'}`}>{inbox.health_score}%</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* ===== STEP: SCHEDULE ===== */}
                {step === 'schedule' && (
                    <div className="space-y-6 animate-slide-up">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Sending Schedule</h2>
                            <p className="text-sm text-muted-foreground">Configure when emails are sent</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Sending Window</div>
                                <div className="flex items-center gap-3 mb-3">
                                    <div>
                                        <label className="text-[10px] text-muted-foreground">Start</label>
                                        <select value={startHour} onChange={e => setStartHour(parseInt(e.target.value))} className="block h-8 text-xs bg-white/[0.04] border border-white/[0.08] rounded px-2 mt-1 text-foreground">
                                            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>)}
                                        </select>
                                    </div>
                                    <ArrowRight className="w-3 h-3 text-muted-foreground mt-4" />
                                    <div>
                                        <label className="text-[10px] text-muted-foreground">End</label>
                                        <select value={endHour} onChange={e => setEndHour(parseInt(e.target.value))} className="block h-8 text-xs bg-white/[0.04] border border-white/[0.08] rounded px-2 mt-1 text-foreground">
                                            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-muted-foreground">Timezone</label>
                                    <select value={timezone} onChange={e => setTimezone(e.target.value)} className="block w-full h-8 text-xs bg-white/[0.04] border border-white/[0.08] rounded px-2 mt-1 text-foreground">
                                        <option value="America/New_York">Eastern (ET)</option>
                                        <option value="America/Chicago">Central (CT)</option>
                                        <option value="America/Denver">Mountain (MT)</option>
                                        <option value="America/Los_Angeles">Pacific (PT)</option>
                                        <option value="Europe/London">London (GMT)</option>
                                        <option value="Asia/Kolkata">India (IST)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Send Days</div>
                                <div className="flex gap-2">
                                    {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => (
                                        <button key={day} onClick={() => toggleDay(day)}
                                            className={`w-10 h-10 rounded-lg text-xs font-semibold uppercase transition-colors ${sendDays.includes(day) ? 'bg-primary/20 text-primary border border-primary/20' : 'bg-white/[0.04] text-muted-foreground border border-transparent'
                                                }`}>{day}</button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-3">Mon–Fri business hours = 23% higher open rates</p>
                            </div>
                        </div>
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Estimated Timeline</div>
                            <div className="text-sm">
                                <span className="text-foreground font-medium">~{Math.ceil(selectedLeadCount / (selectedInboxes.length * (sendMode === 'safe' ? 30 : sendMode === 'moderate' ? 45 : 60) || 1))} business days</span>
                                <span className="text-muted-foreground"> for {selectedLeadCount} leads across {selectedInboxes.length} inbox{selectedInboxes.length !== 1 ? 'es' : ''}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== STEP: HEALTH CHECK ===== */}
                {step === 'health' && (
                    <div className="space-y-6 animate-slide-up">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Deliverability Health Check</h2>
                            <p className="text-sm text-muted-foreground">Pre-send analysis to protect domain reputation</p>
                        </div>
                        {healthChecking ? (
                            <div className="flex flex-col items-center py-20 gap-3">
                                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                <p className="text-sm text-muted-foreground">Analyzing {selectedLeadCount} leads...</p>
                            </div>
                        ) : healthCheck ? (
                            <div className="space-y-4">
                                <div className={`p-5 rounded-xl border ${healthCheck.passed ? 'bg-green-500/5 border-green-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
                                    <div className="flex items-center gap-3">
                                        {healthCheck.passed ? <CheckCircle2 className="w-6 h-6 text-green-400" /> : <XCircle className="w-6 h-6 text-red-400" />}
                                        <div>
                                            <h3 className="text-lg font-bold">{healthCheck.passed ? 'Safe to Send' : 'Campaign Blocked'}</h3>
                                            <p className="text-xs text-muted-foreground">{healthCheck.safe_to_send.toLocaleString()} cleared · {healthCheck.blocked_leads} blocked</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Est. Open Rate', value: `${healthCheck.estimated_open_rate}%`, color: 'text-blue-400' },
                                        { label: 'Est. Reply Rate', value: `${healthCheck.estimated_reply_rate}%`, color: 'text-green-400' },
                                        { label: 'Bounce Risk', value: `${healthCheck.bounce_risk_percent}%`, color: healthCheck.bounce_risk_percent > 5 ? 'text-amber-400' : 'text-green-400' },
                                        { label: 'Risk Level', value: healthCheck.risk_level.toUpperCase(), color: healthCheck.risk_level === 'low' ? 'text-green-400' : 'text-amber-400' },
                                    ].map((m, i) => (
                                        <div key={i} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3.5 text-center">
                                            <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{m.label}</div>
                                        </div>
                                    ))}
                                </div>
                                {healthCheck.recommendations.length > 0 && (
                                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
                                        <div className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Recommendations</div>
                                        {healthCheck.recommendations.map((rec, i) => (
                                            <div key={i} className="text-xs text-muted-foreground flex items-start gap-2 mb-1"><span className="text-amber-400">•</span> {rec}</div>
                                        ))}
                                    </div>
                                )}
                                <Button variant="outline" size="sm" className="text-xs" onClick={runHealthCheck}><RefreshCw className="w-3 h-3 mr-1.5" /> Re-run</Button>
                            </div>
                        ) : (
                            <Button onClick={runHealthCheck}><Shield className="w-4 h-4 mr-2" /> Run Health Check</Button>
                        )}
                    </div>
                )}

                {/* ===== STEP: PREVIEW ===== */}
                {step === 'preview' && (
                    <div className="space-y-6 animate-slide-up">
                        <div>
                            <h2 className="text-xl font-bold mb-1">Preview AI-Generated Email</h2>
                            <p className="text-sm text-muted-foreground">See what personalized emails look like</p>
                        </div>
                        {previewLoading ? (
                            <div className="flex flex-col items-center py-20 gap-3">
                                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                <p className="text-sm text-muted-foreground">Generating personalized email...</p>
                            </div>
                        ) : previewEmail ? (
                            <div className="space-y-4">
                                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">D</div>
                                    <div>
                                        <div className="text-sm font-semibold">Dave Jesurun</div>
                                        <div className="text-xs text-muted-foreground">Founder, CEO · High Country Air Service · Aviation</div>
                                    </div>
                                    <Badge className="ml-auto text-[9px] bg-purple-500/10 text-purple-400 border-purple-500/20"><Sparkles className="w-2.5 h-2.5 mr-0.5" /> AI</Badge>
                                </div>
                                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
                                    <div className="px-5 py-3 border-b border-white/[0.04] bg-white/[0.01]">
                                        <div className="text-xs text-muted-foreground">Subject</div>
                                        <div className="text-sm font-medium mt-0.5">{previewEmail.subject as string}</div>
                                    </div>
                                    <div className="px-5 py-4">
                                        <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">{previewEmail.body as string}</p>
                                    </div>
                                    <div className="px-5 py-3 border-t border-white/[0.04] bg-white/[0.01] flex items-center gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-muted-foreground">Humanization</span>
                                            <Badge variant="outline" className={`text-[9px] ${(previewEmail.humanization_score as number) >= 70 ? 'border-green-500/30 text-green-400' : 'border-amber-500/30 text-amber-400'}`}>
                                                {previewEmail.humanization_score as number}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-muted-foreground">Spam Risk</span>
                                            <Badge variant="outline" className={`text-[9px] ${(previewEmail.spam_risk_score as number) <= 25 ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>
                                                {previewEmail.spam_risk_score as number}
                                            </Badge>
                                        </div>
                                        {previewEmail.is_safe ? (
                                            <Badge className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20 ml-auto"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> Safe</Badge>
                                        ) : (
                                            <Badge className="text-[9px] bg-red-500/10 text-red-400 border-red-500/20 ml-auto"><XCircle className="w-2.5 h-2.5 mr-0.5" /> Blocked</Badge>
                                        )}
                                    </div>
                                </div>
                                {Array.isArray(previewEmail.subject_variants) && (
                                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Subject Variants</div>
                                        {(previewEmail.subject_variants as string[]).map((sv: string, i: number) => (
                                            <div key={i} className="text-xs bg-white/[0.02] rounded-md px-3 py-2 border border-white/[0.04] mb-1.5">{sv}</div>
                                        ))}
                                    </div>
                                )}
                                <Button variant="outline" size="sm" className="text-xs" onClick={generatePreview}><RefreshCw className="w-3 h-3 mr-1.5" /> Regenerate</Button>
                            </div>
                        ) : (
                            <Button onClick={generatePreview}><Sparkles className="w-4 h-4 mr-2" /> Generate Preview</Button>
                        )}
                    </div>
                )}

                {/* ===== STEP: LAUNCH ===== */}
                {step === 'launch' && (
                    <div className="space-y-6 animate-slide-up">
                        {launched ? (
                            <div className="flex flex-col items-center py-16 gap-4">
                                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center animate-scale-in">
                                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                                </div>
                                <h2 className="text-xl font-bold">Campaign Saved! 🚀</h2>
                                <p className="text-sm text-muted-foreground text-center max-w-md">
                                    Your campaign has been created and saved to the database. Monitor it from the dashboard.
                                </p>
                                <Link href="/outreach"><Button className="bg-primary hover:bg-primary/80"><BarChart3 className="w-4 h-4 mr-2" /> View Dashboard</Button></Link>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <h2 className="text-xl font-bold mb-1">Ready to Launch</h2>
                                    <p className="text-sm text-muted-foreground">Review settings and save your campaign</p>
                                </div>
                                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 space-y-3">
                                    {[
                                        { label: 'Campaign Name', value: campaignName || 'Untitled Campaign' },
                                        { label: 'Lead Source', value: selectedSource },
                                        { label: 'Lead Count', value: `${selectedLeadCount} leads` },
                                        { label: 'Sequence', value: `${sequence.filter(s => s.type === 'email').length} emails, ${sequence.filter(s => s.type === 'wait').length} waits` },
                                        { label: 'Inboxes', value: `${selectedInboxes.length} inbox(es)` },
                                        { label: 'Send Mode', value: sendMode.charAt(0).toUpperCase() + sendMode.slice(1) },
                                        { label: 'Schedule', value: `${startHour}:00–${endHour}:00 ${timezone}` },
                                        { label: 'Health Check', value: healthCheck?.passed ? `✅ Passed (${healthCheck.safe_to_send} safe)` : '❌ Failed' },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">{item.label}</span>
                                            <span className="font-medium">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="bg-green-500/5 border border-green-500/10 rounded-xl p-4 space-y-2">
                                    {[
                                        'Emails are AI-personalized — no identical content',
                                        'Send intervals randomized to avoid spam patterns',
                                        'Auto-pause if bounce rate exceeds 5%',
                                        'Bounced credits auto-refunded',
                                        'Unsubscribe link included',
                                    ].map((r, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs text-green-400/80"><CheckCircle2 className="w-3 h-3 flex-shrink-0" /> {r}</div>
                                    ))}
                                </div>
                                <Button size="lg" onClick={handleLaunch} className="w-full bg-primary hover:bg-primary/80 h-12 text-sm font-semibold" disabled={launching || !healthCheck?.passed}>
                                    {launching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                    {launching ? 'Saving Campaign...' : 'Launch Campaign'}
                                </Button>
                            </>
                        )}
                    </div>
                )}

                {/* Navigation */}
                {step !== 'launch' && (
                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                        <Button variant="ghost" onClick={goBack} disabled={stepIndex === 0} className="text-xs"><ChevronLeft className="w-3 h-3 mr-1" /> Back</Button>
                        <Button onClick={goNext} disabled={!canNext()} className="text-xs bg-primary hover:bg-primary/80">
                            {stepIndex === WIZARD_STEPS.length - 2 ? 'Review & Launch' : 'Next'} <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
