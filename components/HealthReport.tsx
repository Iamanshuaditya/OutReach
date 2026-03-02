"use client";

import {
    X, ShieldCheck, AlertTriangle, TrendingUp,
    Sparkles, ArrowRight, Trash2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface HealthReportData {
    total_leads: number;
    bounce_risk_percent: number;
    catch_all_percent: number;
    role_accounts_percent: number;
    stale_percent: number;
    risky_domains: number;
    freshness_distribution: {
        fresh: number;
        recent: number;
        aging: number;
        stale: number;
    };
    overall_health: 'excellent' | 'good' | 'fair' | 'poor';
    safe_to_send: number;
    recommended_daily_limit: number;
}

interface HealthReportProps {
    open: boolean;
    onClose: () => void;
    report: HealthReportData | null;
    onCleanList: () => void;
}

export default function HealthReport({ open, onClose, report, onCleanList }: HealthReportProps) {
    if (!open || !report) return null;

    const healthColors = {
        excellent: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20', label: 'Excellent' },
        good: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', label: 'Good' },
        fair: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', label: 'Fair' },
        poor: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', label: 'Poor' },
    };

    const health = healthColors[report.overall_health];
    const total = report.freshness_distribution.fresh + report.freshness_distribution.recent +
        report.freshness_distribution.aging + report.freshness_distribution.stale || 1;

    return (
        <div className="fixed inset-0 z-50 cmd-backdrop animate-fade-in" onClick={onClose}>
            <div className="fixed left-1/2 top-[8%] -translate-x-1/2 w-full max-w-[560px] max-h-[84vh] animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="glass-strong rounded-2xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col max-h-[84vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg ${health.bg} flex items-center justify-center`}>
                                <ShieldCheck className={`w-4 h-4 ${health.text}`} />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold">List Health Report</h2>
                                <p className="text-[11px] text-muted-foreground">{report.total_leads.toLocaleString()} leads analyzed</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                        {/* Overall Health */}
                        <div className={`rounded-xl p-4 ${health.bg} border ${health.border} animate-slide-up`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Overall Health</div>
                                    <div className={`text-2xl font-bold ${health.text}`}>{health.label}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Safe to Send</div>
                                    <div className="text-2xl font-bold text-foreground">{report.safe_to_send.toLocaleString()}</div>
                                </div>
                            </div>
                            <div className="mt-3 text-xs text-muted-foreground">
                                Recommended daily send limit: <span className="text-foreground font-medium">{report.recommended_daily_limit}</span> per inbox
                            </div>
                        </div>

                        {/* Risk Cards */}
                        <div className="grid grid-cols-2 gap-3">
                            <RiskCard
                                label="Bounce Risk"
                                value={report.bounce_risk_percent}
                                icon={<XCircle className="w-4 h-4" />}
                                threshold={10}
                            />
                            <RiskCard
                                label="Catch-All"
                                value={report.catch_all_percent}
                                icon={<AlertTriangle className="w-4 h-4" />}
                                threshold={20}
                            />
                            <RiskCard
                                label="Role Accounts"
                                value={report.role_accounts_percent}
                                icon={<AlertTriangle className="w-4 h-4" />}
                                threshold={15}
                            />
                            <RiskCard
                                label="Stale Data"
                                value={report.stale_percent}
                                icon={<AlertTriangle className="w-4 h-4" />}
                                threshold={25}
                            />
                        </div>

                        {/* Freshness Distribution */}
                        <div className="animate-slide-up stagger-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Freshness Distribution</div>
                            <div className="w-full h-3 rounded-full overflow-hidden flex bg-white/[0.04]">
                                <div className="h-full bg-green-500 transition-all duration-700"
                                    style={{ width: `${(report.freshness_distribution.fresh / total) * 100}%` }} />
                                <div className="h-full bg-blue-500 transition-all duration-700"
                                    style={{ width: `${(report.freshness_distribution.recent / total) * 100}%` }} />
                                <div className="h-full bg-amber-500 transition-all duration-700"
                                    style={{ width: `${(report.freshness_distribution.aging / total) * 100}%` }} />
                                <div className="h-full bg-red-500 transition-all duration-700"
                                    style={{ width: `${(report.freshness_distribution.stale / total) * 100}%` }} />
                            </div>
                            <div className="flex gap-4 mt-2">
                                {[
                                    { label: 'Fresh (<30d)', count: report.freshness_distribution.fresh, color: 'text-green-400', dot: 'bg-green-500' },
                                    { label: 'Recent (30-60d)', count: report.freshness_distribution.recent, color: 'text-blue-400', dot: 'bg-blue-500' },
                                    { label: 'Aging (60-90d)', count: report.freshness_distribution.aging, color: 'text-amber-400', dot: 'bg-amber-500' },
                                    { label: 'Stale (90d+)', count: report.freshness_distribution.stale, color: 'text-red-400', dot: 'bg-red-500' },
                                ].map(item => (
                                    <div key={item.label} className="flex items-center gap-1.5 text-[10px]">
                                        <div className={`w-2 h-2 rounded-full ${item.dot}`} />
                                        <span className="text-muted-foreground">{item.label}</span>
                                        <span className={`font-medium ${item.color}`}>{item.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Warnings */}
                        {(report.bounce_risk_percent > 10 || report.stale_percent > 20) && (
                            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3.5 text-xs animate-slide-up stagger-3">
                                <div className="flex items-center gap-2 text-amber-400 font-medium mb-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Deliverability Risk Detected
                                </div>
                                <p className="text-muted-foreground leading-relaxed">
                                    We block risky sends to protect your domain. Clean your list to remove contacts you shouldn&apos;t pay for.
                                </p>
                            </div>
                        )}

                        {/* Risky domains */}
                        {report.risky_domains > 0 && (
                            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 text-xs">
                                <span className="text-muted-foreground">Risky domains flagged: </span>
                                <span className="text-amber-400 font-medium">{report.risky_domains}</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground max-w-[280px]">
                            Clean list removes contacts you shouldn&apos;t pay for. No credit charge for removed leads.
                        </p>
                        <Button size="sm" onClick={onCleanList}
                            className="text-xs h-8 bg-primary hover:bg-primary/80">
                            <Sparkles className="w-3 h-3 mr-1.5" />
                            Clean List
                            <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RiskCard({ label, value, icon, threshold }: {
    label: string; value: number; icon: React.ReactNode; threshold: number;
}) {
    const isRisky = value > threshold;
    return (
        <div className={`rounded-xl p-3.5 border animate-slide-up ${isRisky ? 'bg-red-500/5 border-red-500/10' : 'bg-white/[0.02] border-white/[0.04]'
            }`}>
            <div className="flex items-center justify-between mb-2">
                <span className={`${isRisky ? 'text-red-400' : 'text-muted-foreground'}`}>{icon}</span>
                <span className={`text-2xl font-bold tabular-nums ${isRisky ? 'text-red-400' : 'text-foreground'}`}>
                    {value}%
                </span>
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
            <div className="w-full h-1 rounded-full bg-white/[0.04] mt-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${isRisky ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(value, 100)}%` }} />
            </div>
        </div>
    );
}
