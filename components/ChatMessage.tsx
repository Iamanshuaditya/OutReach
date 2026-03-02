"use client";

import type { ChatMessage as ChatMessageType } from "@/lib/chat-types";
import ChatResultsTable from "@/components/ChatResultsTable";

export default function ChatMessage({ message }: { message: ChatMessageType }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600/20 px-3.5 py-2 text-sm text-zinc-200">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%]">
        <p className="text-sm leading-relaxed text-zinc-300">{message.content}</p>
        {message.result && <ChatResultsTable result={message.result} />}
      </div>
    </div>
  );
}
