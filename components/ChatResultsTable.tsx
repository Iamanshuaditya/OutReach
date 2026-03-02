"use client";

import type { ChatQueryResult } from "@/lib/chat-types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ChatResultsTable({ result }: { result: ChatQueryResult }) {
  if (result.type === "error") {
    return (
      <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
        Query failed to execute
        {result.sql && (
          <pre className="mt-1 overflow-x-auto text-[10px] text-zinc-500">
            {result.sql}
          </pre>
        )}
      </div>
    );
  }

  if (result.type === "count") {
    return (
      <div className="mt-2 flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
        <span className="text-2xl font-bold text-indigo-400">
          {result.count?.toLocaleString()}
        </span>
        <span className="text-xs text-zinc-400">results</span>
      </div>
    );
  }

  if (!result.rows || result.rows.length === 0) {
    return (
      <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400">
        No results found
      </div>
    );
  }

  // Show max 5 columns to keep it compact
  const columns = (result.columns || Object.keys(result.rows[0])).slice(0, 5);

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-zinc-700/50">
      <div className="max-h-[240px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-700/50 hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col}
                  className="h-7 bg-zinc-800/80 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
                >
                  {col.replace(/_/g, " ")}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row, i) => (
              <TableRow key={i} className="border-zinc-800 hover:bg-zinc-800/50">
                {columns.map((col) => (
                  <TableCell
                    key={col}
                    className="max-w-[140px] truncate px-2 py-1.5 text-xs text-zinc-300"
                  >
                    {row[col] != null ? String(row[col]) : "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {result.rowCount != null && result.rowCount > 0 && (
        <div className="border-t border-zinc-700/50 bg-zinc-800/50 px-3 py-1.5 text-[10px] text-zinc-500">
          {result.rowCount} row{result.rowCount !== 1 ? "s" : ""}
          {(result.columns?.length ?? 0) > 5 && (
            <span> &middot; {result.columns!.length - 5} more columns</span>
          )}
        </div>
      )}
    </div>
  );
}
