"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Zap, Target, Users, BarChart3, TrendingUp, Play, Pause,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Loader2, CheckCircle2, AlertTriangle, Sparkles, ArrowUpDown,
  ArrowUp, ArrowDown, Flame, ThermometerSun, Snowflake,
  Plus, RefreshCw, Eye, Download, Settings, Trophy,
  GitCompare, Lightbulb, Filter, Search, X, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Tab = "definitions" | "segments" | "stats" | "compare" | "recommend";

interface ICPDefinition {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  priority: number;
  filters: Record<string, unknown>;
  scoring_weights: Record<string, number>;
  avg_deal_size: number;
  sales_cycle_days: number;
  typical_budget_range: string;
  relevant_services: string[];
  total_leads: number;
  tier_1_count: number;
  tier_2_count: number;
  tier_3_count: number;
  sub_segment_count: number;
}

interface SegmentLead {
  id: string;
  email: string;
  lead_id: number;
  source_table: string;
  icp_name: string;
  icp_slug: string;
  sub_segment_name: string | null;
  fit_score: number;
  urgency_score: number;
  budget_score: number;
  signal_score: number;
  composite_score: number;
  tier: string;
  outreach_status: string;
  lead_data: Record<string, unknown>;
  scored_at: string;
}

interface StatsData {
  by_icp: Array<{
    icp_id: string;
    icp_name: string;
    icp_slug: string;
    priority: number;
    total_leads: number;
    tier_1: number;
    tier_2: number;
    tier_3: number;
    avg_composite: number;
    avg_fit: number;
    avg_urgency: number;
    avg_budget: number;
  }>;
  totals: {
    total_segmented: number;
    total_tier_1: number;
    total_tier_2: number;
    total_tier_3: number;
    avg_composite: number;
  };
  score_distribution: Record<string, number>;
  source_tables: Array<{ source_table: string; lead_count: number; avg_score: number }>;
  outreach_status: Array<{ outreach_status: string; count: number }>;
}

interface CompareItem {
  id: string;
  name: string;
  slug: string;
  priority: number;
  avg_deal_size: number;
  sales_cycle_days: number;
  typical_budget_range: string;
  total_leads: number;
  tier_1_leads: number;
  tier_1_ratio: number;
  avg_scores: { composite: number; fit: number; urgency: number; budget: number; signal: number };
  ease_of_closing: string;
  outbound_friendliness: string;
}

interface Recommendation {
  icp_id: string;
  icp_name: string;
  priority: number;
  recommendation_score: number;
  total_leads: number;
  tier_1_leads: number;
  tier_2_leads: number;
  avg_deal_size: number;
  sales_cycle_days: number;
  reasons: string[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function TierBadge({ tier }: { tier: string }) {
  if (tier === "tier_1") return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider badge-hot">
      <Flame className="w-2.5 h-2.5" /> TIER 1
    </span>
  );
  if (tier === "tier_2") return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider badge-warm">
      <ThermometerSun className="w-2.5 h-2.5" /> TIER 2
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider badge-cold">
      <Snowflake className="w-2.5 h-2.5" /> TIER 3
    </span>
  );
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[11px] tabular-nums font-medium w-6 text-right">{score}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-500/10 text-green-400 border-green-500/20",
    paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    archived: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    queued: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    contacted: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    replied: "bg-green-500/10 text-green-400 border-green-500/20",
    converted: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    disqualified: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${styles[status] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}`}>
      {status}
    </Badge>
  );
}

export default function ICPDashboard() {
  const [tab, setTab] = useState<Tab>("definitions");
  const [loading, setLoading] = useState(true);

  // Definitions
  const [definitions, setDefinitions] = useState<ICPDefinition[]>([]);

  // Segments
  const [segments, setSegments] = useState<SegmentLead[]>([]);
  const [segPage, setSegPage] = useState(1);
  const [segTotal, setSegTotal] = useState(0);
  const [segTotalPages, setSegTotalPages] = useState(0);
  const [segIcpFilter, setSegIcpFilter] = useState("");
  const [segTierFilter, setSegTierFilter] = useState("");
  const [segSort, setSegSort] = useState("composite_score");
  const [segSortOrder, setSegSortOrder] = useState<"asc" | "desc">("desc");

  // Stats
  const [stats, setStats] = useState<StatsData | null>(null);

  // Compare
  const [comparison, setComparison] = useState<CompareItem[]>([]);

  // Recommend
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [suggestedSequence, setSuggestedSequence] = useState<Array<{ order: number; icp_name: string; suggested_batch_size: number; reason: string }>>([]);

  // Segmentation
  const [segmenting, setSegmenting] = useState(false);
  const [segmentResult, setSegmentResult] = useState<Record<string, unknown> | null>(null);
  const [leadSources, setLeadSources] = useState<Array<{ table_name: string; row_count: number }>>([]);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [showSegmentModal, setShowSegmentModal] = useState(false);

  // Seeding
  const [seeding, setSeeding] = useState(false);

  // Load data based on tab
  const loadDefinitions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/icp/definitions");
      if (res.ok) {
        const data = await res.json();
        setDefinitions(data.definitions || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadSegments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: segPage.toString(),
        limit: "50",
        sort_by: segSort,
        sort_order: segSortOrder,
      });
      if (segIcpFilter) params.set("icp_id", segIcpFilter);
      if (segTierFilter) params.set("tier", segTierFilter);
      const res = await fetch(`/api/icp/segments?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSegments(data.segments || []);
        setSegTotal(data.totalRows || 0);
        setSegTotalPages(data.totalPages || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [segPage, segSort, segSortOrder, segIcpFilter, segTierFilter]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/icp/segments/stats");
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadComparison = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/icp/compare");
      if (res.ok) {
        const data = await res.json();
        setComparison(data.comparison || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/icp/recommend");
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations || []);
        setSuggestedSequence(data.suggested_sequence || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "definitions") loadDefinitions();
    else if (tab === "segments") loadSegments();
    else if (tab === "stats") loadStats();
    else if (tab === "compare") loadComparison();
    else if (tab === "recommend") loadRecommendations();
  }, [tab, loadDefinitions, loadSegments, loadStats, loadComparison, loadRecommendations]);

  // Load lead sources for segmentation modal
  useEffect(() => {
    fetch("/api/tables")
      .then(r => r.json())
      .then(data => setLeadSources(data.tables || []))
      .catch(() => { });
  }, []);

  const handleSeedICPs = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/icp/definitions/seed", { method: "POST" });
      if (res.ok) {
        await loadDefinitions();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to seed ICPs");
      }
    } catch { alert("Network error"); }
    setSeeding(false);
  };

  const handleRunSegmentation = async () => {
    if (selectedTables.size === 0) return;
    setSegmenting(true);
    setSegmentResult(null);
    try {
      const res = await fetch("/api/icp/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_tables: Array.from(selectedTables) }),
      });
      if (res.ok) {
        const data = await res.json();
        setSegmentResult(data.stats);
        // Refresh stats
        if (tab === "stats") loadStats();
      } else {
        const err = await res.json();
        alert(err.error || "Segmentation failed");
      }
    } catch { alert("Network error"); }
    setSegmenting(false);
  };

  const handleSegSort = (col: string) => {
    if (segSort === col) {
      setSegSortOrder(segSortOrder === "asc" ? "desc" : "asc");
    } else {
      setSegSort(col);
      setSegSortOrder("desc");
    }
    setSegPage(1);
  };

  const toggleTable = (name: string) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "definitions", label: "ICPs", icon: <Target className="w-4 h-4" /> },
    { key: "segments", label: "Segments", icon: <Users className="w-4 h-4" /> },
    { key: "stats", label: "Stats", icon: <BarChart3 className="w-4 h-4" /> },
    { key: "compare", label: "Compare", icon: <GitCompare className="w-4 h-4" /> },
    { key: "recommend", label: "Recommend", icon: <Lightbulb className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border bg-[#0a0a0d] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-xs"><ChevronLeft className="w-3 h-3 mr-1" /> Dashboard</Button>
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-primary flex items-center justify-center">
              <Target className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-sm font-bold">ICP Segmentation Engine</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setShowSegmentModal(true)}>
            <Play className="w-3 h-3 mr-1.5" /> Run Segmentation
          </Button>
          <Link href="/outreach">
            <Button variant="ghost" size="sm" className="text-xs h-8">
              <Mail className="w-3 h-3 mr-1.5" /> Outreach
            </Button>
          </Link>
        </div>
      </nav>

      {/* Tabs */}
      <div className="border-b border-border bg-[#0b0b0e] px-6">
        <div className="flex gap-1 py-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.key
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent"
                }`}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ═══ DEFINITIONS TAB ═══ */}
        {tab === "definitions" && (
          <div className="space-y-6 animate-slide-up">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">ICP Definitions</h2>
                <p className="text-sm text-muted-foreground">Manage your Ideal Customer Profiles</p>
              </div>
              <div className="flex items-center gap-2">
                {definitions.length === 0 && (
                  <Button size="sm" className="text-xs h-8 bg-primary" onClick={handleSeedICPs} disabled={seeding}>
                    {seeding ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1.5" />}
                    Seed 4 Preset ICPs
                  </Button>
                )}
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={loadDefinitions}>
                  <RefreshCw className="w-3 h-3 mr-1.5" /> Refresh
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : definitions.length === 0 ? (
              <div className="text-center py-20 bg-white/[0.01] border border-white/[0.04] rounded-xl">
                <Target className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <h3 className="text-sm font-semibold mb-1">No ICPs defined yet</h3>
                <p className="text-xs text-muted-foreground mb-4">Seed the 4 preset ICPs to get started</p>
                <Button size="sm" className="text-xs bg-primary" onClick={handleSeedICPs} disabled={seeding}>
                  {seeding ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1.5" />}
                  Seed Preset ICPs
                </Button>
              </div>
            ) : (
              <div className="grid gap-4">
                {definitions.map(icp => (
                  <div key={icp.id} className="bg-white/[0.01] border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.1] transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${icp.priority === 1 ? "bg-primary/20 text-primary" :
                          icp.priority === 2 ? "bg-emerald-500/20 text-emerald-400" :
                            icp.priority === 3 ? "bg-amber-500/20 text-amber-400" :
                              "bg-zinc-500/20 text-zinc-400"
                          }`}>
                          P{icp.priority}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            {icp.name}
                            <StatusBadge status={icp.status} />
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{icp.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold tabular-nums">{formatNumber(icp.total_leads)}</div>
                        <div className="text-[10px] text-muted-foreground">total leads</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                      <div className="bg-white/[0.02] rounded-lg p-2.5">
                        <div className="text-[10px] text-muted-foreground mb-1">Tier 1</div>
                        <div className="text-sm font-bold text-red-400">{formatNumber(icp.tier_1_count)}</div>
                      </div>
                      <div className="bg-white/[0.02] rounded-lg p-2.5">
                        <div className="text-[10px] text-muted-foreground mb-1">Tier 2</div>
                        <div className="text-sm font-bold text-amber-400">{formatNumber(icp.tier_2_count)}</div>
                      </div>
                      <div className="bg-white/[0.02] rounded-lg p-2.5">
                        <div className="text-[10px] text-muted-foreground mb-1">Tier 3</div>
                        <div className="text-sm font-bold text-zinc-400">{formatNumber(icp.tier_3_count)}</div>
                      </div>
                      <div className="bg-white/[0.02] rounded-lg p-2.5">
                        <div className="text-[10px] text-muted-foreground mb-1">Avg Deal</div>
                        <div className="text-sm font-bold">${formatNumber(icp.avg_deal_size)}</div>
                      </div>
                      <div className="bg-white/[0.02] rounded-lg p-2.5">
                        <div className="text-[10px] text-muted-foreground mb-1">Cycle</div>
                        <div className="text-sm font-bold">{icp.sales_cycle_days}d</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {icp.relevant_services?.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] border-white/[0.08] bg-white/[0.02]">{s}</Badge>
                      ))}
                      {icp.sub_segment_count > 0 && (
                        <Badge variant="outline" className="text-[10px] border-purple-500/20 text-purple-400 bg-purple-500/5">
                          {icp.sub_segment_count} sub-segments
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ SEGMENTS TAB ═══ */}
        {tab === "segments" && (
          <div className="space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Segmented Leads</h2>
              <div className="flex items-center gap-2">
                {/* ICP filter */}
                <select value={segIcpFilter} onChange={e => { setSegIcpFilter(e.target.value); setSegPage(1); }}
                  className="h-8 text-xs bg-white/[0.02] border border-white/[0.06] rounded-lg px-2 text-foreground">
                  <option value="">All ICPs</option>
                  {definitions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {/* Tier filter */}
                <select value={segTierFilter} onChange={e => { setSegTierFilter(e.target.value); setSegPage(1); }}
                  className="h-8 text-xs bg-white/[0.02] border border-white/[0.06] rounded-lg px-2 text-foreground">
                  <option value="">All Tiers</option>
                  <option value="tier_1">Tier 1</option>
                  <option value="tier_2">Tier 2</option>
                  <option value="tier_3">Tier 3</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : segments.length === 0 ? (
              <div className="text-center py-20 bg-white/[0.01] border border-white/[0.04] rounded-xl">
                <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <h3 className="text-sm font-semibold mb-1">No segmented leads</h3>
                <p className="text-xs text-muted-foreground">Run segmentation to classify your leads</p>
              </div>
            ) : (
              <>
                <div className="overflow-auto border border-white/[0.06] rounded-xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50 hover:bg-transparent">
                        <TableHead className="text-[10px] w-[60px]">Tier</TableHead>
                        <TableHead className="text-[10px]">Email</TableHead>
                        <TableHead className="text-[10px]">ICP</TableHead>
                        <TableHead className="text-[10px]">Sub-segment</TableHead>
                        {["composite_score", "fit_score", "urgency_score", "budget_score"].map(col => (
                          <TableHead key={col} className="text-[10px] cursor-pointer hover:text-foreground" onClick={() => handleSegSort(col)}>
                            <span className="inline-flex items-center gap-1">
                              {col.replace("_score", "").replace("composite", "Score")}
                              {segSort === col ? (segSortOrder === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}
                            </span>
                          </TableHead>
                        ))}
                        <TableHead className="text-[10px]">Status</TableHead>
                        <TableHead className="text-[10px]">Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {segments.map(seg => (
                        <TableRow key={seg.id} className="border-border/30 table-row-hover">
                          <TableCell><TierBadge tier={seg.tier} /></TableCell>
                          <TableCell className="text-[12px] text-primary">{seg.email || "—"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{seg.icp_name}</Badge></TableCell>
                          <TableCell className="text-[11px] text-muted-foreground">{seg.sub_segment_name || "—"}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-bold tabular-nums ${seg.composite_score >= 75 ? "text-green-400" : seg.composite_score >= 50 ? "text-amber-400" : "text-zinc-400"}`}>
                              {seg.composite_score}
                            </span>
                          </TableCell>
                          <TableCell><ScoreBar score={seg.fit_score} color="bg-blue-500" /></TableCell>
                          <TableCell><ScoreBar score={seg.urgency_score} color="bg-amber-500" /></TableCell>
                          <TableCell><ScoreBar score={seg.budget_score} color="bg-green-500" /></TableCell>
                          <TableCell><StatusBadge status={seg.outreach_status} /></TableCell>
                          <TableCell className="text-[11px] text-muted-foreground truncate max-w-[120px]">{seg.source_table}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {segTotalPages > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {formatNumber(segTotal)} leads
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSegPage(1)} disabled={segPage === 1}>
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSegPage(segPage - 1)} disabled={segPage === 1}>
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </Button>
                      <span className="text-xs px-2 tabular-nums">{segPage} / {segTotalPages}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSegPage(segPage + 1)} disabled={segPage === segTotalPages}>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSegPage(segTotalPages)} disabled={segPage === segTotalPages}>
                        <ChevronsRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══ STATS TAB ═══ */}
        {tab === "stats" && (
          <div className="space-y-6 animate-slide-up">
            <h2 className="text-lg font-bold">Segmentation Stats</h2>

            {loading || !stats ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Segmented</div>
                    <div className="text-2xl font-bold">{formatNumber(stats.totals.total_segmented)}</div>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Tier 1</div>
                    <div className="text-2xl font-bold text-red-400">{formatNumber(stats.totals.total_tier_1)}</div>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Tier 2</div>
                    <div className="text-2xl font-bold text-amber-400">{formatNumber(stats.totals.total_tier_2)}</div>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Tier 3</div>
                    <div className="text-2xl font-bold text-zinc-400">{formatNumber(stats.totals.total_tier_3)}</div>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Avg Score</div>
                    <div className="text-2xl font-bold text-primary">{stats.totals.avg_composite ?? 0}</div>
                  </div>
                </div>

                {/* Per-ICP breakdown */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">By ICP</h3>
                  <div className="grid gap-3">
                    {stats.by_icp.map(icp => (
                      <div key={icp.icp_id} className="bg-white/[0.01] border border-white/[0.06] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold">{icp.icp_name}</h4>
                          <span className="text-sm font-bold tabular-nums">{formatNumber(icp.total_leads)} leads</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1">Tier Distribution</div>
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-red-400 font-bold">{icp.tier_1}</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-amber-400 font-bold">{icp.tier_2}</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-zinc-400 font-bold">{icp.tier_3}</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1">Avg Composite</div>
                            <ScoreBar score={icp.avg_composite ?? 0} color="bg-primary" />
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1">Avg Fit</div>
                            <ScoreBar score={icp.avg_fit ?? 0} color="bg-blue-500" />
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1">Avg Urgency</div>
                            <ScoreBar score={icp.avg_urgency ?? 0} color="bg-amber-500" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score distribution */}
                {stats.score_distribution && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Score Distribution</h3>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { label: "90-100", key: "score_90_100", color: "bg-green-500" },
                        { label: "75-89", key: "score_75_89", color: "bg-emerald-500" },
                        { label: "50-74", key: "score_50_74", color: "bg-amber-500" },
                        { label: "25-49", key: "score_25_49", color: "bg-orange-500" },
                        { label: "0-24", key: "score_0_24", color: "bg-red-500" },
                      ].map(bucket => (
                        <div key={bucket.key} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 text-center">
                          <div className={`w-3 h-3 rounded-full ${bucket.color} mx-auto mb-2`} />
                          <div className="text-sm font-bold tabular-nums">{formatNumber(stats.score_distribution[bucket.key] ?? 0)}</div>
                          <div className="text-[10px] text-muted-foreground">{bucket.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Source tables */}
                {stats.source_tables.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Top Source Tables</h3>
                    <div className="space-y-1.5">
                      {stats.source_tables.slice(0, 10).map(st => (
                        <div key={st.source_table} className="flex items-center justify-between bg-white/[0.01] border border-white/[0.04] rounded-lg px-3 py-2">
                          <span className="text-xs truncate max-w-[300px]">{st.source_table}</span>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="tabular-nums">{formatNumber(st.lead_count)} leads</span>
                            <span className="tabular-nums text-muted-foreground">avg {st.avg_score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══ COMPARE TAB ═══ */}
        {tab === "compare" && (
          <div className="space-y-6 animate-slide-up">
            <h2 className="text-lg font-bold">ICP Comparison Matrix</h2>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : comparison.length === 0 ? (
              <div className="text-center py-20 bg-white/[0.01] border border-white/[0.04] rounded-xl">
                <GitCompare className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No ICPs to compare. Seed ICPs and run segmentation first.</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="text-[10px] w-[180px]">ICP</TableHead>
                      <TableHead className="text-[10px] text-center">Leads</TableHead>
                      <TableHead className="text-[10px] text-center">Tier 1</TableHead>
                      <TableHead className="text-[10px] text-center">T1 %</TableHead>
                      <TableHead className="text-[10px] text-center">Avg Score</TableHead>
                      <TableHead className="text-[10px] text-center">Deal Size</TableHead>
                      <TableHead className="text-[10px] text-center">Cycle</TableHead>
                      <TableHead className="text-[10px] text-center">Closing</TableHead>
                      <TableHead className="text-[10px] text-center">Outbound</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.map(c => (
                      <TableRow key={c.id} className="border-border/30 table-row-hover">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${c.priority === 1 ? "bg-primary/20 text-primary" :
                              c.priority === 2 ? "bg-emerald-500/20 text-emerald-400" :
                                c.priority === 3 ? "bg-amber-500/20 text-amber-400" :
                                  "bg-zinc-500/20 text-zinc-400"
                              }`}>
                              P{c.priority}
                            </div>
                            <span className="text-xs font-medium">{c.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-xs tabular-nums font-medium">{formatNumber(c.total_leads)}</TableCell>
                        <TableCell className="text-center text-xs tabular-nums font-bold text-red-400">{formatNumber(c.tier_1_leads)}</TableCell>
                        <TableCell className="text-center text-xs tabular-nums">{c.tier_1_ratio}%</TableCell>
                        <TableCell className="text-center"><ScoreBar score={c.avg_scores.composite} color="bg-primary" /></TableCell>
                        <TableCell className="text-center text-xs tabular-nums">${formatNumber(c.avg_deal_size)}</TableCell>
                        <TableCell className="text-center text-xs tabular-nums">{c.sales_cycle_days}d</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[10px] ${c.ease_of_closing === "high" ? "text-green-400 border-green-500/20" : c.ease_of_closing === "medium" ? "text-amber-400 border-amber-500/20" : "text-zinc-400 border-zinc-500/20"}`}>
                            {c.ease_of_closing}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[10px] ${c.outbound_friendliness === "high" ? "text-green-400 border-green-500/20" : c.outbound_friendliness === "medium" ? "text-amber-400 border-amber-500/20" : "text-zinc-400 border-zinc-500/20"}`}>
                            {c.outbound_friendliness}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* ═══ RECOMMEND TAB ═══ */}
        {tab === "recommend" && (
          <div className="space-y-6 animate-slide-up">
            <h2 className="text-lg font-bold">Targeting Recommendations</h2>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : recommendations.length === 0 ? (
              <div className="text-center py-20 bg-white/[0.01] border border-white/[0.04] rounded-xl">
                <Lightbulb className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No recommendations yet. Seed ICPs and run segmentation first.</p>
              </div>
            ) : (
              <>
                {/* Suggested sequence */}
                {suggestedSequence.length > 0 && (
                  <div className="bg-primary/5 border border-primary/15 rounded-xl p-5">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <Trophy className="w-4 h-4 text-primary" />
                      Suggested Campaign Sequence
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {suggestedSequence.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2">
                            <div className="text-[10px] text-muted-foreground">Step {s.order}</div>
                            <div className="text-xs font-semibold">{s.icp_name}</div>
                            <div className="text-[10px] text-muted-foreground">{s.suggested_batch_size} leads</div>
                          </div>
                          {i < suggestedSequence.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/30" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ranked recommendations */}
                <div className="space-y-3">
                  {recommendations.map((rec, i) => (
                    <div key={rec.icp_id} className="bg-white/[0.01] border border-white/[0.06] rounded-xl p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${i === 0 ? "bg-primary/20 text-primary" : "bg-white/[0.04] text-muted-foreground"
                            }`}>
                            #{i + 1}
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold">{rec.icp_name}</h4>
                            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                              <span>T1: <strong className="text-red-400">{rec.tier_1_leads}</strong></span>
                              <span>T2: <strong className="text-amber-400">{rec.tier_2_leads}</strong></span>
                              <span>${formatNumber(rec.avg_deal_size)} avg</span>
                              <span>{rec.sales_cycle_days}d cycle</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${rec.recommendation_score >= 60 ? "text-green-400" : rec.recommendation_score >= 30 ? "text-amber-400" : "text-zinc-400"}`}>
                            {rec.recommendation_score}
                          </div>
                          <div className="text-[10px] text-muted-foreground">score</div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {rec.reasons.map((reason, ri) => (
                          <div key={ri} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <CheckCircle2 className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                            {reason}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ SEGMENTATION MODAL ═══ */}
      {showSegmentModal && (
        <div className="fixed inset-0 z-50 cmd-backdrop animate-fade-in" onClick={() => setShowSegmentModal(false)}>
          <div className="fixed left-1/2 top-[10%] -translate-x-1/2 w-full max-w-[560px] max-h-[80vh] animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="glass-strong rounded-2xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Play className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Run Segmentation</h2>
                    <p className="text-[11px] text-muted-foreground">Select tables to classify leads against your ICPs</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSegmentModal(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2">
                  <Filter className="w-3 h-3" /> Select Source Tables
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={() => setSelectedTables(new Set(leadSources.map(s => s.table_name)))}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={() => setSelectedTables(new Set())}>
                    Clear
                  </Button>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {leadSources.map(src => (
                    <button key={src.table_name} onClick={() => toggleTable(src.table_name)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${selectedTables.has(src.table_name)
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-white/[0.01] text-foreground/60 border border-white/[0.04] hover:bg-white/[0.04]"
                        }`}>
                      <span className="truncate max-w-[350px]">{src.table_name}</span>
                      <span className="text-[10px] tabular-nums flex-shrink-0 ml-2">{formatNumber(src.row_count)}</span>
                    </button>
                  ))}
                </div>

                {segmentResult && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-xs text-green-400">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span className="font-semibold">Segmentation Complete</span>
                    </div>
                    <div className="text-green-400/80">
                      Processed {(segmentResult as Record<string, unknown>).total_processed?.toLocaleString()} leads,
                      matched {(segmentResult as Record<string, unknown>).total_matched?.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{selectedTables.size} tables selected</span>
                <Button size="sm" className="text-xs h-8 bg-primary" onClick={handleRunSegmentation}
                  disabled={segmenting || selectedTables.size === 0}>
                  {segmenting ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Play className="w-3 h-3 mr-1.5" />}
                  {segmenting ? "Processing..." : "Run Segmentation"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
