"use client";

import { useEffect, useMemo, useState } from "react";

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  total_sent: number;
  total_opened: number;
  total_clicked: number;
  total_replied: number;
  total_bounced: number;
  total_unsubscribed: number;
  updated_at: string;
};

type InboxRow = {
  inbox_id: string;
  email: string;
  sent_count: number;
  failed_count: number;
  pending_count: number;
};

type TimelineRow = {
  created_at: string;
  event_type: string;
  campaign_name: string | null;
  inbox_email: string | null;
  metadata: Record<string, unknown>;
};

type FailureRow = {
  created_at: string;
  level: string;
  log_type: string;
  message: string;
};

type AnalyticsResponse = {
  campaigns: CampaignRow[];
  inboxes: InboxRow[];
  timeline: TimelineRow[];
  failures: FailureRow[];
};

export default function OutreachAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/outreach/analytics", {
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to load analytics");
        }

        const payload = (await response.json()) as AnalyticsResponse;
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load analytics");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    if (!data) {
      return {
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        bounced: 0,
        unsubscribed: 0,
      };
    }

    return data.campaigns.reduce(
      (acc, campaign) => {
        acc.sent += Number(campaign.total_sent || 0);
        acc.opened += Number(campaign.total_opened || 0);
        acc.clicked += Number(campaign.total_clicked || 0);
        acc.replied += Number(campaign.total_replied || 0);
        acc.bounced += Number(campaign.total_bounced || 0);
        acc.unsubscribed += Number(campaign.total_unsubscribed || 0);
        return acc;
      },
      {
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        bounced: 0,
        unsubscribed: 0,
      }
    );
  }, [data]);

  return (
    <main className="min-h-screen bg-[#070b14] text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-semibold">Outreach Analytics</h1>
          <p className="text-slate-400 text-sm md:text-base">
            Sent, engagement, replies, bounces, unsubscribes, inbox volume, and failure visibility.
          </p>
        </header>

        {loading && <p className="text-slate-400">Loading analytics...</p>}
        {error && <p className="text-red-400">{error}</p>}

        {!loading && data && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                ["Sent", totals.sent],
                ["Opened", totals.opened],
                ["Clicked", totals.clicked],
                ["Replied", totals.replied],
                ["Bounced", totals.bounced],
                ["Unsubscribed", totals.unsubscribed],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"
                >
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="text-xl font-semibold">{Number(value).toLocaleString()}</p>
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900/70 overflow-x-auto">
              <div className="px-4 py-3 border-b border-slate-800 text-sm font-medium">Campaign Metrics</div>
              <table className="w-full text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="text-left px-4 py-2">Campaign</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Sent</th>
                    <th className="text-left px-4 py-2">Opened</th>
                    <th className="text-left px-4 py-2">Clicked</th>
                    <th className="text-left px-4 py-2">Replied</th>
                    <th className="text-left px-4 py-2">Bounced</th>
                    <th className="text-left px-4 py-2">Unsub</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-t border-slate-800">
                      <td className="px-4 py-2">{campaign.name}</td>
                      <td className="px-4 py-2">{campaign.status}</td>
                      <td className="px-4 py-2">{campaign.total_sent}</td>
                      <td className="px-4 py-2">{campaign.total_opened}</td>
                      <td className="px-4 py-2">{campaign.total_clicked}</td>
                      <td className="px-4 py-2">{campaign.total_replied}</td>
                      <td className="px-4 py-2">{campaign.total_bounced}</td>
                      <td className="px-4 py-2">{campaign.total_unsubscribed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70">
                <div className="px-4 py-3 border-b border-slate-800 text-sm font-medium">Inbox Send Counts</div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="text-left px-4 py-2">Inbox</th>
                        <th className="text-left px-4 py-2">Sent</th>
                        <th className="text-left px-4 py-2">Failed</th>
                        <th className="text-left px-4 py-2">Pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.inboxes.map((inbox) => (
                        <tr key={inbox.inbox_id} className="border-t border-slate-800">
                          <td className="px-4 py-2">{inbox.email}</td>
                          <td className="px-4 py-2">{inbox.sent_count}</td>
                          <td className="px-4 py-2">{inbox.failed_count}</td>
                          <td className="px-4 py-2">{inbox.pending_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/70">
                <div className="px-4 py-3 border-b border-slate-800 text-sm font-medium">Failure Logs</div>
                <ul className="max-h-80 overflow-auto divide-y divide-slate-800 text-sm">
                  {data.failures.map((entry, index) => (
                    <li key={`${entry.created_at}-${index}`} className="px-4 py-2">
                      <p className="text-slate-200">{entry.message}</p>
                      <p className="text-xs text-slate-500">
                        {entry.log_type} · {entry.level} · {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900/70">
              <div className="px-4 py-3 border-b border-slate-800 text-sm font-medium">Event Timeline</div>
              <ul className="max-h-96 overflow-auto divide-y divide-slate-800 text-sm">
                {data.timeline.map((event, index) => (
                  <li key={`${event.created_at}-${event.event_type}-${index}`} className="px-4 py-2">
                    <p className="text-slate-200">
                      {event.event_type} · {event.campaign_name ?? "Unknown campaign"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {event.inbox_email ?? "Unknown inbox"} · {new Date(event.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
