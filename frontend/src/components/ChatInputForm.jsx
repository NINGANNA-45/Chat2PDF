import React, { useState } from "react";
import { Link2, Loader2, ArrowRight } from "lucide-react";

export default function ChatInputForm({ onSubmit, loading, initialValue = "", size = "default" }) {
  const [url, setUrl] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  const isEmpty = url.trim().length === 0;

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (isEmpty || loading) return;
    onSubmit(url.trim());
  }

  const paddingClass = size === "large" ? "p-2" : "p-1.5";

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={`flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white shadow-soft sm:flex-row sm:items-center ${paddingClass}`}
      >
        <div className="flex flex-1 items-center gap-2 px-3 py-2">
          <Link2 size={18} className="shrink-0 text-gray-400" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="https://chatgpt.com/share/..."
            className="w-full border-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
            aria-label="Shared conversation URL"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              Generate PDF
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
      {touched && isEmpty && (
        <p className="mt-2 pl-2 text-sm text-red-500">Please paste a shared conversation link.</p>
      )}
    </form>
  );
}
