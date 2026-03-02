"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Database } from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import type {
  ChatMessage as ChatMessageType,
  ChatAPIResponse,
} from "@/lib/chat-types";

const STARTER_CHIPS = [
  "Find CEOs in tech",
  "Count leads by industry",
  "Show active campaigns",
  "Leads in California",
];

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Cmd+J toggle
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const history = messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, history }),
        });

        const data: ChatAPIResponse = await res.json();

        const assistantMsg: ChatMessageType = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.error || data.explanation || "Something went wrong.",
          timestamp: Date.now(),
          result: data.result,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Failed to reach the server. Please try again.",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages]
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 transition-transform hover:scale-105 active:scale-95"
        aria-label="Toggle chat"
      >
        {open ? <X size={20} /> : <MessageSquare size={20} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chat-panel-enter fixed bottom-20 right-5 z-50 flex h-[600px] w-[420px] flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[rgba(15,15,18,0.92)] shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
              <Database size={16} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Database Chat
              </h3>
              <p className="text-[10px] text-zinc-500">
                Ask anything about your data &middot; Cmd+J
              </p>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 && !loading && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10">
                  <MessageSquare size={18} className="text-indigo-400" />
                </div>
                <p className="text-center text-xs text-zinc-500">
                  Query your database in plain English
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {STARTER_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => sendMessage(chip)}
                      className="rounded-full border border-zinc-700/50 bg-zinc-800/50 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-indigo-500/30 hover:text-zinc-200"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 px-1 py-2">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-indigo-400 [animation-delay:0.15s]" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-indigo-400 [animation-delay:0.3s]" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-white/[0.06] px-3 py-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="flex items-center gap-2 rounded-xl bg-zinc-800/60 px-3 py-1.5"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your data..."
                disabled={loading}
                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white transition-opacity disabled:opacity-30"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
