import React from "react";
import { User, Bot } from "lucide-react";

export default function ConversationPreview({ conversation }) {
  if (!conversation) return null;
  const { metadata, messages } = conversation;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          {metadata.platform}
        </p>
        <h3 className="mt-0.5 text-base font-bold text-gray-900">
          {metadata.title || "Untitled conversation"}
        </h3>
        <p className="mt-1 text-xs text-gray-500">{messages.length} messages found</p>
      </div>

      <div className="max-h-96 space-y-4 overflow-y-auto px-5 py-4">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className="flex items-start gap-3">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  isUser ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-600"
                }`}
              >
                {isUser ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-500">{msg.sender}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-800 line-clamp-4">
                  {msg.content}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
