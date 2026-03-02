"use client";

import { useState } from "react";
import {
    Check, X, Zap, Crown, Building2, ArrowRight,
    ShieldCheck, RotateCcw, Pause, CreditCard,
    ChevronLeft, Sparkles, Users, Database,
    Gift, Clock, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        price: 49,
        credits: 500,
        icon: <Zap className="w-5 h-5" />,
        color: 'from-blue-500 to-cyan-400',
        features: [
            'Up to 500 verified leads/mo',
            'Email verification',
            'Freshness badges',
            'Basic lead scoring',
            'CSV export',
            'Auto-refund on bounces',
        ],
        excluded: ['AI ICP Builder', 'Unique Lead Packs', 'Priority support'],
    },
    {
        id: 'pro',
        name: 'Professional',
        price: 149,
        credits: 2500,
        icon: <Crown className="w-5 h-5" />,
        color: 'from-primary to-purple-500',
        popular: true,
        features: [
            'Up to 2,500 verified leads/mo',
            'Everything in Starter',
            'AI ICP Builder',
            'AI Outreach Insights',
            'Deliverability Health Reports',
            'Saturation Meter',
            'Playbook creation',
            'Auto-refund on bounces',
            'Credits roll over (1 month)',
        ],
        excluded: ['Unique Lead Packs', 'Custom integrations'],
    },
    {
        id: 'scale',
        name: 'Scale',
        price: 399,
        credits: 10000,
        icon: <Building2 className="w-5 h-5" />,
        color: 'from-amber-500 to-orange-400',
        features: [
            'Up to 10,000 verified leads/mo',
            'Everything in Professional',
            'Unique Lead Packs access',
            'Custom ICP scoring models',
            'API access',
            'Team seats (up to 5)',
            'Priority support',
            'Credits roll over (3 months)',
            'Dedicated account manager',
        ],
        excluded: [],
    },
];

export default function PricingPage() {
    const [annual, setAnnual] = useState(false);

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

            <div className="max-w-5xl mx-auto px-6 py-16">
                {/* Hero */}
                <div className="text-center mb-16">
                    <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 text-xs">
                        <Gift className="w-3 h-3 mr-1" /> Simple, transparent pricing
                    </Badge>
                    <h1 className="text-4xl font-bold mb-4 tracking-tight">
                        Only pay for <span className="text-gradient">verified contacts</span>
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
                        No lock-in. Pause anytime. Auto-refund on bounces. Credits roll over.
                    </p>

                    {/* Annual toggle */}
                    <div className="flex items-center justify-center gap-3 mt-8">
                        <span className={`text-sm ${!annual ? 'text-foreground' : 'text-muted-foreground'}`}>Monthly</span>
                        <button onClick={() => setAnnual(!annual)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-primary' : 'bg-white/10'}`}>
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${annual ? 'left-7' : 'left-1'}`} />
                        </button>
                        <span className={`text-sm ${annual ? 'text-foreground' : 'text-muted-foreground'}`}>
                            Annual <Badge className="ml-1 text-[9px] bg-green-500/10 text-green-400 border-green-500/20">Save 20%</Badge>
                        </span>
                    </div>
                </div>

                {/* Plans */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-20">
                    {PLANS.map((plan) => (
                        <div key={plan.id}
                            className={`relative rounded-2xl border p-6 flex flex-col transition-all hover:scale-[1.02] ${plan.popular
                                    ? 'border-primary/30 bg-primary/[0.03] shadow-xl shadow-primary/5'
                                    : 'border-white/[0.06] bg-white/[0.01]'
                                }`}>
                            {plan.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <Badge className="bg-primary text-white text-[10px] shadow-lg shadow-primary/20">
                                        Most Popular
                                    </Badge>
                                </div>
                            )}

                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center text-white mb-4 shadow-lg`}>
                                {plan.icon}
                            </div>

                            <h3 className="text-lg font-bold">{plan.name}</h3>
                            <div className="flex items-baseline gap-1 mt-2 mb-1">
                                <span className="text-3xl font-bold">${annual ? Math.round(plan.price * 0.8) : plan.price}</span>
                                <span className="text-sm text-muted-foreground">/mo</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-5">{plan.credits.toLocaleString()} credits included</p>

                            <Button className={`w-full mb-5 ${plan.popular ? 'bg-primary hover:bg-primary/80' : 'bg-white/[0.06] hover:bg-white/10 text-foreground'
                                }`}>
                                Get Started <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                            </Button>

                            <div className="flex-1 space-y-2.5">
                                {plan.features.map((f, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs">
                                        <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                                        <span className="text-foreground/80">{f}</span>
                                    </div>
                                ))}
                                {plan.excluded.map((f, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs">
                                        <X className="w-3.5 h-3.5 text-muted-foreground/30 flex-shrink-0 mt-0.5" />
                                        <span className="text-muted-foreground/40">{f}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* What counts as a credit */}
                <div className="mb-16">
                    <h2 className="text-xl font-bold mb-6 text-center">What counts as a credit?</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { icon: <Database className="w-4 h-4 text-primary" />, title: "1 credit = 1 verified lead", desc: "You only pay when we deliver a verified, high-confidence contact. Low-confidence results are free." },
                            { icon: <RotateCcw className="w-4 h-4 text-green-400" />, title: "Auto-refund on bounces", desc: "If a verified email bounces after you send, the credit is automatically refunded. No questions asked." },
                            { icon: <ShieldCheck className="w-4 h-4 text-amber-400" />, title: "No charge for removed leads", desc: "When you clean your list, removed contacts don't count. You only pay for leads worth reaching." },
                        ].map((item, i) => (
                            <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5">
                                <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center mb-3">{item.icon}</div>
                                <h3 className="text-sm font-semibold mb-1.5">{item.title}</h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Policies */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-16">
                    {[
                        { icon: <Pause className="w-4 h-4" />, title: "Pause & Cancel", desc: "Pause your subscription anytime — your credits are frozen until you resume. Cancel with one click, no retention flows, no penalties." },
                        { icon: <Wallet className="w-4 h-4" />, title: "Credits Roll Over", desc: "Unused credits roll over to the next month (Starter: 1mo, Pro: 1mo, Scale: 3mo). Use them when you need them." },
                        { icon: <ShieldCheck className="w-4 h-4" />, title: "Data Ethics & Compliance", desc: "We source only publicly available business data. Opt-out handling is built in. We never store sensitive personal data beyond necessary business fields." },
                        { icon: <Clock className="w-4 h-4" />, title: "Freshness Guarantee", desc: "Every lead includes verification timestamps and proof trails. Know exactly when data was last checked and how it was verified." },
                    ].map((item, i) => (
                        <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5 flex gap-4">
                            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">{item.icon}</div>
                            <div>
                                <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* CTA */}
                <div className="text-center bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 rounded-2xl p-10">
                    <h2 className="text-2xl font-bold mb-2">Ready to find your best leads?</h2>
                    <p className="text-muted-foreground mb-6">Start free — no credit card required. 50 free credits to explore.</p>
                    <div className="flex items-center justify-center gap-3">
                        <Link href="/">
                            <Button size="lg" className="bg-primary hover:bg-primary/80">
                                <Sparkles className="w-4 h-4 mr-2" /> Start Free Trial
                            </Button>
                        </Link>
                        <Button size="lg" variant="outline">Talk to Sales</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
