import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Search, ArrowRight, X, Loader2 } from "lucide-react";
import { assistantApi } from "../../api/assistant";
import type { AssistantQueryResponse } from "../../types";

interface AssistantCommandBarProps {
  compact?: boolean;
}

export const AssistantCommandBar: React.FC<AssistantCommandBarProps> = ({ compact = false }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssistantQueryResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSearch = async (textToSearch?: string) => {
    const q = textToSearch || query;
    if (!q.trim()) return;

    setLoading(true);
    setIsOpen(true);
    try {
      const res = await assistantApi.query(q);
      setResult(res);
    } catch {
      setResult({
        query: q,
        intent: "ERROR",
        headline: "Assistant Query Failed",
        answer: "Could not process request at this time. Please check your connection and try again.",
        action_url: null,
        data: null,
        suggestions: ["My hours this week", "Upcoming holidays"],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleChipClick = (suggestionText: string) => {
    setQuery(suggestionText);
    handleSearch(suggestionText);
  };

  return (
    <div className={`relative ${compact ? "w-80" : "w-full max-w-2xl"}`}>
      {/* Search Input Bar */}
      <div className="flex items-center gap-2 rounded-xl border border-indigo-200/80 bg-indigo-50/40 px-3 py-1.5 shadow-xs transition focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100">
        <Sparkles className="h-4 w-4 shrink-0 text-indigo-600 animate-pulse" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask assistant (e.g. 'My hours this week', 'Holidays')..."
          className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-hidden"
          id="assistant-query-input"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResult(null);
            }}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => handleSearch()}
          disabled={loading || !query.trim()}
          className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-40"
          title="Search"
          id="assistant-query-submit-btn"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
        </button>
      </div>

      {/* Interactive Result Popover / Card */}
      {isOpen && result && (
        <div className="absolute top-11 right-0 z-50 w-96 rounded-2xl border border-indigo-100 bg-white p-4 shadow-xl shadow-indigo-100/40">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-indigo-700 uppercase">
                {result.intent}
              </span>
              <h4 className="mt-1 text-sm font-semibold text-slate-900">{result.headline}</h4>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-600">{result.answer}</p>

          {/* Action Navigation Button */}
          {result.action_url && (
            <button
              onClick={() => {
                setIsOpen(false);
                navigate(result.action_url as string);
              }}
              className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
              id="assistant-action-btn"
            >
              <span>Open Relevant Hub</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Follow-up suggestions */}
          {result.suggestions && result.suggestions.length > 0 && (
            <div className="mt-3.5 border-t border-slate-100 pt-3">
              <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                Suggested Prompts
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.suggestions.map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleChipClick(sug)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
