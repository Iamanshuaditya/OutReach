"use client";

import { useState } from "react";
import {
    Package, ShieldCheck, Sparkles, ArrowRight, ChevronLeft,
    Zap, Star, Users, TrendingUp, Eye, Clock, Filter,
    CheckCircle2, Lock, Flame, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Link from "next/link";

const PACKS = [
    {
        id: 'aviation-ops',
        title: 'Aviation Operations Leaders',
        niche: 'Aviation & Aerospace',
        description: 'Operations managers, directors, and VPs at aviation companies. Ideal for B2B services targeting flight ops, MRO, and ground handling.',
        lead_count: 4200,
        avg_confidence: 91,
        overlap_estimate: 'very_low' as const,
        price_credits: 350,
        freshness_promise: 'Verified within 30 days',
        tags: ['Operations', 'Aviation', 'MRO', 'C-Suite'],
        color: 'from-blue-500 to-cyan-400',
    },
    {
        id: 'logistics-dispatch',
        title: 'Logistics & Dispatch Managers',
        niche: 'Transportation & Logistics',
        description: 'Dispatch managers and logistics coordinators at trucking, freight, and 3PL companies across the US.',
        lead_count: 8500,
        avg_confidence: 88,
        overlap_estimate: 'low' as const,
        price_credits: 500,
        freshness_promise: 'Verified within 21 days',
        tags: ['Logistics', 'Trucking', '3PL', 'Dispatch'],
        color: 'from-amber-500 to-orange-400',
    },
    {
        id: 'medical-mfg',
        title: 'SMB Medical Device Manufacturing',
        niche: 'Healthcare Manufacturing',
        description: 'Founders, CEOs, and ops leaders at medical device manufacturers with 10–200 employees. High-value, niche audience.',
        lead_count: 2800,
        avg_confidence: 93,
        overlap_estimate: 'very_low' as const,
        price_credits: 450,
        freshness_promise: 'Verified within 14 days',
        tags: ['MedTech', 'Manufacturing', 'CEO', 'FDA'],
        color: 'from-green-500 to-emerald-400',
    },
    {
        id: 'fintech-ops',
        title: 'FinTech Operations & Compliance',
        niche: 'Financial Technology',
        description: 'Compliance officers, COOs, and heads of operations at FinTech startups and scale-ups. Perfect for RegTech, compliance tools.',
        lead_count: 5600,
        avg_confidence: 89,
        overlap_estimate: 'low' as const,
        price_credits: 380,
        freshness_promise: 'Verified within 21 days',
        tags: ['FinTech', 'Compliance', 'RegTech', 'COO'],
        color: 'from-purple-500 to-pink-400',
    },
    {
        id: 'construction-tech',
        title: 'Construction Tech Decision Makers',
        niche: 'Construction Technology',
        description: 'CTOs, IT directors, and tech leads at construction companies adopting digital tools. Underserved, high-conversion niche.',
        lead_count: 3400,
        avg_confidence: 90,
        overlap_estimate: 'very_low' as const,
        price_credits: 400,
        freshness_promise: 'Verified within 30 days',
        tags: ['ConTech', 'Construction', 'CTO', 'Digital'],
        color: 'from-orange-500 to-red-400',
    },
    {
        id: 'food-bev-founders',
        title: 'Food & Beverage Founders',
        niche: 'Food & Beverage',
        description: 'Founders and CEOs of emerging food & beverage brands, DTC and wholesale. Ideal for packaging, distribution, and marketing services.',
        lead_count: 6200,
        avg_confidence: 87,
        overlap_estimate: 'low' as const,
        price_credits: 320,
        freshness_promise: 'Verified within 30 days',
        tags: ['F&B', 'DTC', 'Founders', 'CPG'],
        color: 'from-pink-500 to-rose-400',
    },
];

const OVERLAP_LABELS = {
    very_low: { label: 'Very Low', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    low: { label: 'Low', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    medium: { label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
};

export default function UniquePacksPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [previewPack, setPreviewPack] = useState<string | null>(null);

    const filtered = searchQuery
        ? PACKS.filter(p =>
            p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.niche.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        : PACKS;

    return (
        <div className="min-h-screen bg-background">
            {/* Nav */}
            <nav className="border-b border-border px-6 py-3 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg shadow-primary/20">
                        <Zap className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm font-bold tracking-tight">LeadBase</span>
                </Link>
                <Link href="/">
                    <Button variant="ghost" size="sm" className="text-xs">
                        <ChevronLeft className="w-3 h-3 mr-1" /> Back to Dashboard
                    </Button>
                </Link>
            </nav>

            <div className="max-w-5xl mx-auto px-6 py-12">
                {/* Hero */}
                <div className="text-center mb-12">
                    <Badge className="mb-4 bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">
                        <Package className="w-3 h-3 mr-1" /> Unique Lead Packs
                    </Badge>
                    <h1 className="text-3xl font-bold mb-3 tracking-tight">
                        Discover <span className="text-gradient-warm">untouched audiences</span>
                    </h1>
                    <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
                        Curated lead packs from niche industries with low overlap — higher reply rates, less competition.
                        Every pack meets minimum freshness and confidence thresholds.
                    </p>
                </div>

                {/* Search */}
                <div className="max-w-md mx-auto mb-10">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search packs by niche, industry, title..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 bg-white/[0.02] border-white/[0.06]"
                        />
                    </div>
                </div>

                {/* Pack Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-16">
                    {filtered.map((pack) => {
                        const overlap = OVERLAP_LABELS[pack.overlap_estimate];
                        return (
                            <div key={pack.id}
                                className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.01] p-5 flex flex-col transition-all hover:border-white/[0.12] hover:bg-white/[0.02]">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${pack.color} flex items-center justify-center shadow-lg`}>
                                        <Package className="w-4 h-4 text-white" />
                                    </div>
                                    <Badge className={`text-[9px] ${overlap.bg} ${overlap.color} ${overlap.border}`}>
                                        {overlap.label} Overlap
                                    </Badge>
                                </div>

                                <h3 className="text-[15px] font-semibold mb-1">{pack.title}</h3>
                                <p className="text-xs text-muted-foreground/80 mb-3">{pack.niche}</p>
                                <p className="text-xs text-muted-foreground leading-relaxed mb-4 flex-1">{pack.description}</p>

                                {/* Tags */}
                                <div className="flex flex-wrap gap-1 mb-4">
                                    {pack.tags.map(tag => (
                                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground border border-white/[0.06]">
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    <div className="bg-white/[0.03] rounded-lg p-2 text-center">
                                        <div className="text-[10px] text-muted-foreground mb-0.5">Leads</div>
                                        <div className="text-sm font-bold">{pack.lead_count.toLocaleString()}</div>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-2 text-center">
                                        <div className="text-[10px] text-muted-foreground mb-0.5">Confidence</div>
                                        <div className="text-sm font-bold text-green-400">{pack.avg_confidence}%</div>
                                    </div>
                                    <div className="bg-white/[0.03] rounded-lg p-2 text-center">
                                        <div className="text-[10px] text-muted-foreground mb-0.5">Credits</div>
                                        <div className="text-sm font-bold text-primary">{pack.price_credits}</div>
                                    </div>
                                </div>

                                {/* Freshness guarantee */}
                                <div className="flex items-center gap-1.5 text-[11px] text-green-400/80 mb-4">
                                    <Clock className="w-3 h-3" />
                                    {pack.freshness_promise}
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="flex-1 text-xs h-8"
                                        onClick={() => setPreviewPack(previewPack === pack.id ? null : pack.id)}>
                                        <Eye className="w-3 h-3 mr-1.5" /> Preview
                                    </Button>
                                    <Button size="sm" className="flex-1 text-xs h-8 bg-primary hover:bg-primary/80">
                                        <Sparkles className="w-3 h-3 mr-1.5" /> Get Pack
                                    </Button>
                                </div>

                                {/* Preview Sample */}
                                {previewPack === pack.id && (
                                    <div className="mt-4 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 animate-slide-up">
                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sample Leads (3 of {pack.lead_count.toLocaleString()})</div>
                                        <div className="space-y-2">
                                            {[
                                                { name: 'James Mitchell', title: 'VP Operations', company: 'AeroTech Solutions' },
                                                { name: 'Sarah Chen', title: 'Director of Engineering', company: 'NexGen Industries' },
                                                { name: 'Michael Torres', title: 'CEO & Founder', company: 'Precision MFG Co' },
                                            ].map((sample, i) => (
                                                <div key={i} className="flex items-center justify-between py-1.5 px-2 bg-white/[0.02] rounded-md">
                                                    <div>
                                                        <div className="text-xs font-medium">{sample.name}</div>
                                                        <div className="text-[10px] text-muted-foreground">{sample.title} at {sample.company}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                                                        <Lock className="w-3 h-3 text-muted-foreground/30" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">
                                            Full data (email, LinkedIn, phone) unlocked after purchase
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Pack Promise */}
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-8 text-center mb-12">
                    <ShieldCheck className="w-8 h-8 text-primary mx-auto mb-3" />
                    <h2 className="text-lg font-bold mb-2">Our Pack Promise</h2>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                        Every pack meets minimum freshness and confidence thresholds. Proof and timestamps are included.
                        If a pack doesn&apos;t meet our standards, we don&apos;t ship it.
                    </p>
                    <div className="flex items-center justify-center gap-6 mt-6">
                        {[
                            { icon: <CheckCircle2 className="w-4 h-4 text-green-400" />, label: '85%+ avg confidence' },
                            { icon: <Clock className="w-4 h-4 text-blue-400" />, label: 'Verified within 30 days' },
                            { icon: <Star className="w-4 h-4 text-amber-400" />, label: 'Low overlap guarantee' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                {item.icon} {item.label}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
