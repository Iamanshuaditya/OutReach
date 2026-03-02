export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  result?: ChatQueryResult;
}

export interface ChatQueryResult {
  type: "table" | "count" | "error";
  columns?: string[];
  rows?: Record<string, unknown>[];
  count?: number;
  sql?: string;
  rowCount?: number;
}

export interface ChatAPIRequest {
  query: string;
  history: { role: "user" | "assistant"; content: string }[];
}

export interface ChatAPIResponse {
  explanation: string;
  result?: ChatQueryResult;
  error?: string;
}
