"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, Database, TableProperties, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown,
  PanelLeftClose, PanelLeft, Globe, Mail, Phone, X, Users,
  LayoutGrid, Flame, ThermometerSun, Snowflake, ShieldCheck,
  Clock, Command, Sparkles, CheckCircle2, AlertTriangle,
  XCircle, TrendingUp, Download, FileText, Filter,
  CheckSquare, Square, Zap, BarChart3, Package,
} from "lucide-react";
import CommandPalette from "@/components/CommandPalette";
import LeadDetailPanel from "@/components/LeadDetailPanel";
import ICPBuilderModal from "@/components/ICPBuilderModal";
import HealthReport from "@/components/HealthReport";
import { enrichLead, generateHealthReport } from "@/lib/scoring";
import type { Lead, EnrichedLead } from "@/lib/types";
import { COLUMN_LABELS } from "@/lib/types";

interface TableInfo {
  table_name: string;
  row_count: number;
}

interface LeadsResponse {
  data: Lead[];
  totalRows: number;
  page: number;
  limit: number;
  totalPages: number;
  columns: string[];
  allColumns: string[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function formatTableName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 45);
}

export default function Dashboard() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [selectedTable, setSelectedTable] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [enrichedLeads, setEnrichedLeads] = useState<EnrichedLead[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tableSearch, setTableSearch] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const limit = 50;

  // New states
  const [cmdOpen, setCmdOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [icpOpen, setIcpOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [healthReport, setHealthReport] = useState<ReturnType<typeof generateHealthReport> | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [scoreFilter, setScoreFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [phoneOnly, setPhoneOnly] = useState(false);

  // ⌘K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        setIcpOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    fetch("/api/tables")
      .then((r) => r.json())
      .then((data) => {
        setTables(data.tables);
        setTotalLeads(data.total);
        setTablesLoading(false);
        if (data.tables.length > 0) {
          setSelectedTable(data.tables[0].table_name);
        }
      })
      .catch(() => setTablesLoading(false));
  }, []);

  const fetchLeads = useCallback(async () => {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        table: selectedTable,
        page: page.toString(),
        limit: limit.toString(),
        search,
        sortBy,
        sortOrder,
      });
      const res = await fetch(`/api/leads?${params}`);
      const data: LeadsResponse = await res.json();
      setLeads(data.data);
      setEnrichedLeads(data.data.map(enrichLead));
      setTotalRows(data.totalRows);
      setTotalPages(data.totalPages);
      setColumns(data.columns.filter((c) => c !== "last_name"));
    } catch {
      setLeads([]);
      setEnrichedLeads([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTable, page, search, sortBy, sortOrder]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  function handleSearchInput(value: string) {
    setSearchInput(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 400);
  }

  function handleSort(col: string) {
    if (sortBy === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("asc");
    }
    setPage(1);
  }

  function handleTableSelect(tableName: string) {
    setSelectedTable(tableName);
    setPage(1);
    setSearch("");
    setSearchInput("");
    setSortBy("");
    setSortOrder("asc");
    setSelectedRows(new Set());
    setSelectedLead(null);
    setScoreFilter('all');
    setVerifiedOnly(false);
    setPhoneOnly(false);
  }

  function handleCommandAction(action: string, payload?: Record<string, unknown>) {
    switch (action) {
      case 'open-icp-builder': setIcpOpen(true); break;
      case 'filter-hot': setScoreFilter('hot'); break;
      case 'filter-verified': setVerifiedOnly(true); break;
      case 'health-report': {
        const report = generateHealthReport(leads);
        setHealthReport(report);
        setHealthOpen(true);
        break;
      }
      case 'select-table': {
        if (payload?.table) handleTableSelect(payload.table as string);
        break;
      }
      case 'export': handleExport(); break;
      case 'top-200': {
        setScoreFilter('hot');
        break;
      }
    }
  }

  function handleExport() {
    const rows = filteredEnrichedLeads;
    if (rows.length === 0) return;
    const headers = columns.join(',');
    const csvRows = rows.map(r => columns.map(c => `"${String(r[c] || '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leadbase-export-${selectedTable}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleRow(id: number) {
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllRows() {
    if (selectedRows.size === filteredEnrichedLeads.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredEnrichedLeads.map(l => l.id)));
    }
  }

  // Filter enriched leads
  const filteredEnrichedLeads = enrichedLeads.filter(lead => {
    if (scoreFilter !== 'all' && lead.lead_score_bucket !== scoreFilter) return false;
    if (verifiedOnly && lead.email_verification_status !== 'verified') return false;
    if (phoneOnly && !lead.phone) return false;
    return true;
  });

  const filteredTables = tables.filter((t) =>
    t.table_name.toLowerCase().includes(tableSearch.toLowerCase())
  );

  const selectedTableInfo = tables.find((t) => t.table_name === selectedTable);

  // Stats
  const hotCount = enrichedLeads.filter(l => l.lead_score_bucket === 'hot').length;
  const warmCount = enrichedLeads.filter(l => l.lead_score_bucket === 'warm').length;
  const phoneCount = enrichedLeads.filter(l => !!l.phone).length;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onAction={handleCommandAction} tables={tables} />

      {/* ICP Builder */}
      <ICPBuilderModal open={icpOpen} onClose={() => setIcpOpen(false)} onApplyFilters={() => { }} />

      {/* Health Report */}
      <HealthReport open={healthOpen} onClose={() => setHealthOpen(false)} report={healthReport} onCleanList={() => { setVerifiedOnly(true); setHealthOpen(false); }} />

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-72" : "w-0"} transition-all duration-200 flex-shrink-0 border-r border-border bg-[#0a0a0d] overflow-hidden`}>
        <div className="w-72 h-full flex flex-col">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg shadow-primary/20">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-foreground tracking-tight">LeadBase</h1>
                <p className="text-[10px] text-muted-foreground">Sales Intelligence Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                Live
              </Badge>
              <span className="text-[11px] text-muted-foreground font-medium">{formatNumber(totalLeads)} leads</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-3 border-b border-border space-y-1.5">
            <button onClick={() => setCmdOpen(true)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-colors">
              <Command className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">Command palette</span>
              <kbd className="text-[9px] bg-white/[0.06] px-1 py-0.5 rounded font-mono">⌘K</kbd>
            </button>
            <button onClick={() => setIcpOpen(true)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="flex-1 text-left">AI ICP Builder</span>
              <kbd className="text-[9px] bg-white/[0.06] px-1 py-0.5 rounded font-mono">⌘I</kbd>
            </button>
          </div>

          {/* Table Search */}
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search tables..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white/[0.02] border-white/[0.06]"
              />
            </div>
          </div>

          {/* Table List */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-2 pb-2">
              <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-2 py-1.5 mb-1 flex items-center gap-1.5">
                <LayoutGrid className="w-3 h-3" />
                Tables ({filteredTables.length})
              </div>
              {tablesLoading ? (
                <div className="space-y-1 px-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                filteredTables.map((t) => (
                  <button
                    key={t.table_name}
                    onClick={() => handleTableSelect(t.table_name)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-[12px] flex items-center justify-between gap-2 mb-0.5 transition-all ${selectedTable === t.table_name
                      ? "bg-primary/10 text-primary border border-primary/15"
                      : "text-foreground/60 hover:bg-white/[0.04] hover:text-foreground border border-transparent"
                      }`}
                  >
                    <span className="truncate flex items-center gap-2 min-w-0">
                      <TableProperties className={`w-3.5 h-3.5 flex-shrink-0 ${selectedTable === t.table_name ? 'text-primary' : 'opacity-40'}`} />
                      <span className="truncate">{formatTableName(t.table_name)}</span>
                    </span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-[18px] flex-shrink-0 bg-white/[0.04] text-muted-foreground border-0">
                      {formatNumber(t.row_count)}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-border">
            <button
              onClick={() => {
                const report = generateHealthReport(leads);
                setHealthReport(report);
                setHealthOpen(true);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Health Report</span>
            </button>
            <a href="/outreach"
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-primary" />
              <span>Outreach</span>
              <Badge variant="outline" className="text-[8px] ml-auto border-primary/20 text-primary bg-primary/5">New</Badge>
            </a>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="border-b border-border bg-[#0c0c0f] px-4 py-2.5 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
            onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </Button>

          <Separator orientation="vertical" className="h-5" />

          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search leads by name, email, company, title..."
                value={searchInput}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="pl-9 h-8 bg-white/[0.02] border-white/[0.06] text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Score filter pills */}
            <div className="flex items-center gap-1 bg-white/[0.02] rounded-lg p-0.5 border border-white/[0.04]">
              {[
                { key: 'all' as const, label: 'All', count: enrichedLeads.length },
                { key: 'hot' as const, label: 'Hot', count: hotCount, color: 'text-red-400' },
                { key: 'warm' as const, label: 'Warm', count: warmCount, color: 'text-amber-400' },
              ].map(f => (
                <button key={f.key} onClick={() => setScoreFilter(f.key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${scoreFilter === f.key ? 'bg-white/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}>
                  {f.label}
                  {f.count > 0 && <span className={`ml-1 ${f.color || ''}`}>{f.count}</span>}
                </button>
              ))}
            </div>

            <button
              onClick={() => setVerifiedOnly(!verifiedOnly)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${verifiedOnly
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'text-muted-foreground border-white/[0.04] hover:bg-white/[0.04]'
                }`}
            >
              <ShieldCheck className="w-3 h-3" />
              Verified
            </button>

            <button
              onClick={() => setPhoneOnly(!phoneOnly)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${phoneOnly
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                : 'text-muted-foreground border-white/[0.04] hover:bg-white/[0.04]'
                }`}
            >
              <Phone className="w-3 h-3" />
              Phone
              {phoneCount > 0 && <span className={`ml-0.5 ${phoneOnly ? 'text-blue-400' : 'text-muted-foreground'}`}>{phoneCount}</span>}
            </button>

            <Separator orientation="vertical" className="h-5" />

            {selectedTableInfo && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">
                  <span className="text-foreground font-semibold">{formatNumber(selectedTableInfo.row_count)}</span> total
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="text-muted-foreground">
                  <span className="text-foreground font-semibold">{filteredEnrichedLeads.length}</span> showing
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Active Filters Bar */}
        <div className="px-4 py-1.5 bg-[#0b0b0e] border-b border-border flex items-center gap-2 text-sm min-h-[36px]">
          <Users className="w-3 h-3 text-muted-foreground" />
          <Badge variant="outline" className="text-[10px] font-medium h-5 border-white/[0.08] bg-white/[0.02]">
            {selectedTable ? formatTableName(selectedTable) : "Select a table"}
          </Badge>
          {search && (
            <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer h-5 bg-primary/10 text-primary border-primary/15"
              onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>
              &ldquo;{search}&rdquo;
              <X className="w-2.5 h-2.5" />
            </Badge>
          )}
          {sortBy && (
            <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer h-5 bg-amber-500/10 text-amber-400 border-amber-500/15"
              onClick={() => { setSortBy(""); setSortOrder("asc"); }}>
              {COLUMN_LABELS[sortBy] || sortBy} {sortOrder === "asc" ? "↑" : "↓"}
              <X className="w-2.5 h-2.5" />
            </Badge>
          )}
          {scoreFilter !== 'all' && (
            <Badge variant="secondary" className={`text-[10px] gap-1 cursor-pointer h-5 ${scoreFilter === 'hot' ? 'badge-hot' : 'badge-warm'
              }`} onClick={() => setScoreFilter('all')}>
              {scoreFilter.toUpperCase()} only
              <X className="w-2.5 h-2.5" />
            </Badge>
          )}
          {verifiedOnly && (
            <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer h-5 badge-verified"
              onClick={() => setVerifiedOnly(false)}>
              Verified only
              <X className="w-2.5 h-2.5" />
            </Badge>
          )}
          {phoneOnly && (
            <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer h-5 bg-blue-500/10 text-blue-400 border border-blue-500/20"
              onClick={() => setPhoneOnly(false)}>
              Has phone
              <X className="w-2.5 h-2.5" />
            </Badge>
          )}
        </div>

        {/* Bulk Actions Bar */}
        {selectedRows.size > 0 && (
          <div className="px-4 py-2 bg-primary/5 border-b border-primary/10 flex items-center gap-3 animate-slide-up">
            <span className="text-xs font-medium text-primary">{selectedRows.size} selected</span>
            <Separator orientation="vertical" className="h-4" />
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:bg-primary/10" onClick={handleExport}>
              <Download className="w-3 h-3 mr-1.5" /> Export
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:bg-primary/10"
              onClick={() => { const report = generateHealthReport(leads.filter(l => selectedRows.has(l.id))); setHealthReport(report); setHealthOpen(true); }}>
              <FileText className="w-3 h-3 mr-1.5" /> Health Check
            </Button>
            <div className="ml-auto">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                onClick={() => setSelectedRows(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Table + Detail Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Table Area */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="p-4 space-y-1.5">
                {Array.from({ length: 15 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-md" />
                ))}
              </div>
            ) : filteredEnrichedLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Database className="w-12 h-12 mb-3 opacity-10" />
                <p className="text-sm font-medium">
                  {search ? "No leads match your search" : "Select a table to view leads"}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#0c0c0f]">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="w-10 text-center">
                      <button onClick={toggleAllRows} className="text-muted-foreground hover:text-foreground transition-colors">
                        {selectedRows.size === filteredEnrichedLeads.length && filteredEnrichedLeads.length > 0 ? (
                          <CheckSquare className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="w-[60px] text-center text-[10px]">Score</TableHead>
                    <TableHead className="w-[70px] text-center text-[10px]">Verified</TableHead>
                    <TableHead className="w-[50px] text-center text-[10px]">Phone</TableHead>
                    {columns.map((col) => (
                      <TableHead key={col} onClick={() => handleSort(col)}
                        className="cursor-pointer hover:text-foreground select-none text-[10px] uppercase tracking-wider whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {COLUMN_LABELS[col] || col}
                          {sortBy === col ? (
                            sortOrder === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-20" />
                          )}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEnrichedLeads.map((lead, idx) => (
                    <TableRow key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`border-border/30 cursor-pointer table-row-hover transition-colors ${selectedLead?.id === lead.id ? 'bg-primary/[0.06]' : ''
                        } ${selectedRows.has(lead.id) ? 'bg-primary/[0.04]' : ''}`}>
                      <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleRow(lead.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                          {selectedRows.has(lead.id) ? (
                            <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreBadge bucket={lead.lead_score_bucket} />
                      </TableCell>
                      <TableCell className="text-center">
                        <VerificationBadge status={lead.email_verification_status} confidence={lead.email_confidence_score} daysAgo={lead.freshness_days_ago} />
                      </TableCell>
                      <TableCell className="text-center">
                        {lead.phone ? (
                          <Phone className="w-3.5 h-3.5 text-blue-400 mx-auto" />
                        ) : (
                          <Phone className="w-3.5 h-3.5 text-zinc-700 mx-auto" />
                        )}
                      </TableCell>
                      {columns.map((col) => (
                        <TableCell key={col} className="max-w-[260px]">
                          <CellValue column={col} value={lead[col]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Lead Detail Panel */}
          {selectedLead && (
            <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />
          )}
        </div>

        {/* Pagination */}
        {totalPages > 0 && !loading && (
          <div className="border-t border-border bg-[#0c0c0f] px-4 py-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, totalRows).toLocaleString()} of {totalRows.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(1)} disabled={page === 1}>
                <ChevronsLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(page - 1)} disabled={page === 1}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === -1 ? (
                  <span key={`dots-${i}`} className="px-1 text-muted-foreground text-xs">...</span>
                ) : (
                  <Button key={p} variant={p === page ? "default" : "ghost"} size="sm"
                    className={`h-7 w-7 p-0 text-xs ${p === page ? 'bg-primary/20 text-primary border border-primary/20' : ''}`}
                    onClick={() => setPage(p)}>
                    {p}
                  </Button>
                )
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(page + 1)} disabled={page === totalPages}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
                <ChevronsRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// --- Sub-components ---

function ScoreBadge({ bucket }: { bucket: string }) {
  if (bucket === 'hot') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider badge-hot">
      <Flame className="w-2.5 h-2.5" /> HOT
    </span>
  );
  if (bucket === 'warm') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider badge-warm">
      <ThermometerSun className="w-2.5 h-2.5" /> WARM
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider badge-cold">
      <Snowflake className="w-2.5 h-2.5" /> COLD
    </span>
  );
}

function VerificationBadge({ status, confidence, daysAgo }: {
  status: string; confidence: number; daysAgo: number | null;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {status === 'verified' ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
      ) : status === 'catch-all' ? (
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
      ) : status === 'invalid' || status === 'disposable' ? (
        <XCircle className="w-3.5 h-3.5 text-red-400" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
      )}
      <span className={`text-[9px] font-medium tabular-nums ${confidence >= 80 ? 'text-green-400' : confidence >= 60 ? 'text-amber-400' : 'text-red-400'
        }`}>{confidence}</span>
    </div>
  );
}

function CellValue({ column, value }: { column: string; value: string | number | null | undefined }) {
  if (!value || value === "null" || value === "undefined") {
    return <span className="text-muted-foreground/30">—</span>;
  }
  const str = String(value).trim();
  if (!str) return <span className="text-muted-foreground/30">—</span>;

  if (column === "email") {
    return (
      <a href={`mailto:${str}`} className="text-primary hover:underline inline-flex items-center gap-1.5 text-[13px]"
        onClick={(e) => e.stopPropagation()}>
        <Mail className="w-3 h-3 flex-shrink-0 opacity-50" />
        <span className="truncate max-w-[200px]">{str}</span>
      </a>
    );
  }
  if (column === "website") {
    const url = str.startsWith("http") ? str : `https://${str}`;
    const display = str.replace(/^https?:\/\/(www\.)?/, "").slice(0, 30);
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="text-primary hover:underline inline-flex items-center gap-1.5 text-[13px]"
        onClick={(e) => e.stopPropagation()}>
        <Globe className="w-3 h-3 flex-shrink-0 opacity-50" />
        <span className="truncate max-w-[180px]">{display}</span>
      </a>
    );
  }
  if (column === "linkedin") {
    return (
      <a href={str.startsWith("http") ? str : `https://${str}`} target="_blank" rel="noopener noreferrer"
        className="text-blue-400 hover:underline inline-flex items-center gap-1.5 text-[13px]"
        onClick={(e) => e.stopPropagation()}>
        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
        Profile
      </a>
    );
  }
  if (column === "phone") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Phone className="w-3 h-3 flex-shrink-0 opacity-50" />
        {str}
      </span>
    );
  }
  if (column === "name") {
    return <span className="font-medium text-foreground text-[13px] truncate block max-w-[200px]">{str}</span>;
  }
  if (column === "title") {
    return <span className="text-[13px] text-foreground/70 truncate block max-w-[200px]">{str}</span>;
  }
  if (column === "company") {
    return <span className="text-[13px] truncate block max-w-[180px]">{str}</span>;
  }
  return <span className="text-[13px] truncate block max-w-[180px] text-foreground/60">{str}</span>;
}

function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: number[] = [1];
  if (current > 3) pages.push(-1);
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push(-1);
  pages.push(total);
  return pages;
}
