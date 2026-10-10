import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Search,
  ArrowRight,
  X,
  Loader2,
  Bot,
  PanelLeft,
  Compass,
  Layers,
} from "lucide-react";
import { assistantApi } from "../../api/assistant";
import { useAssistant } from "../../context/AssistantContext";
import type { AssistantQueryResponse } from "../../types";

interface AssistantCommandBarProps {
  variant?: "navbar" | "sidebar" | "floating_hud";
}

export const AssistantCommandBar: React.FC<AssistantCommandBarProps> = ({ variant = "navbar" }) => {
  const navigate = useNavigate();
  const { position, setPosition, isOpen, setIsOpen } = useAssistant();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssistantQueryResponse | null>(null);
  const [showPositionMenu, setShowPositionMenu] = useState(false);

  // Guard: only render the active position variant
  const isMatch =
    (variant === "navbar" && position === "NAVBAR") ||
    (variant === "sidebar" && position === "SIDEBAR") ||
    (variant === "floating_hud" && position === "FLOATING_HUD");

  if (!isMatch) return null;

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

  const renderPositionSwitcher = (fullWidth = false) => (
    <div
      className={`grid grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-0.5 text-[11px] font-medium text-slate-600 ${
        fullWidth ? "w-full" : ""
      }`}
    >
      <button
        onClick={() => setPosition("FLOATING_HUD")}
        className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1 transition ${
          position === "FLOATING_HUD"
            ? "bg-white text-indigo-700 shadow-xs font-semibold"
            : "hover:text-slate-900"
        }`}
        title="Floating HUD (Bottom-Right)"
      >
        <Layers className="h-3 w-3 shrink-0" />
        <span>HUD</span>
      </button>
      <button
        onClick={() => setPosition("NAVBAR")}
        className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1 transition ${
          position === "NAVBAR"
            ? "bg-white text-indigo-700 shadow-xs font-semibold"
            : "hover:text-slate-900"
        }`}
        title="Top Navbar"
      >
        <Compass className="h-3 w-3 shrink-0" />
        <span>Navbar</span>
      </button>
      <button
        onClick={() => setPosition("SIDEBAR")}
        className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1 transition ${
          position === "SIDEBAR"
            ? "bg-white text-indigo-700 shadow-xs font-semibold"
            : "hover:text-slate-900"
        }`}
        title="Left Sidebar"
      >
        <PanelLeft className="h-3 w-3 shrink-0" />
        <span>Sidebar</span>
      </button>
    </div>
  );

  const renderResultCard = () => {
    if (!result) return null;
    return (
      <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3.5">
        <div className="flex items-start justify-between gap-2 border-b border-indigo-100/60 pb-2">
          <div>
            <span className="inline-block rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-800 uppercase">
              {result.intent}
            </span>
            <h4 className="mt-1 text-xs font-bold text-slate-900">{result.headline}</h4>
          </div>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-700">{result.answer}</p>

        {result.action_url && (
          <button
            onClick={() => {
              setIsOpen(false);
              navigate(result.action_url as string);
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            <span>Open Target Hub</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}

        {result.suggestions && result.suggestions.length > 0 && (
          <div className="mt-3 border-t border-indigo-100/60 pt-2.5">
            <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Follow-up Suggestions
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {result.suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleChipClick(sug)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- 1. FLOATING HUD VARIANT (Bottom-Right) ---
  if (variant === "floating_hud") {
    return (
      <>
        {/* Floating Trigger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white shadow-xl shadow-indigo-500/30 transition hover:scale-105 active:scale-95"
          id="assistant-hud-trigger-btn"
          title="Open AI Assistant"
        >
          <Sparkles className="h-4 w-4 animate-spin-slow text-amber-300" />
          <span className="text-xs font-bold tracking-wide">AI Assistant</span>
        </button>

        {/* Floating Dialog Drawer */}
        {isOpen && (
          <div className="fixed bottom-20 right-6 z-50 w-96 max-h-[80vh] overflow-y-auto rounded-2xl border border-indigo-100 bg-white p-4 shadow-2xl shadow-indigo-900/15 animate-in fade-in slide-in-from-bottom-4 duration-200">
            {/* Header with Position Switcher */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Attendance AI</h3>
                  <p className="text-[10px] text-slate-400">Position: Floating HUD</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Position Switcher Controls */}
            <div className="mt-2.5 flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Position</span>
              {renderPositionSwitcher()}
            </div>

            {/* Search Input */}
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 py-1.5 shadow-2xs focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100">
              <Search className="h-3.5 w-3.5 text-indigo-600" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask or command (e.g. 'Apply sick leave tomorrow')..."
                className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-hidden"
                id="assistant-hud-input"
              />
              <button
                onClick={() => handleSearch()}
                disabled={loading || !query.trim()}
                className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
              </button>
            </div>

            {/* Quick Sample Prompts */}
            {!result && (
              <div className="mt-3">
                <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Quick Actions</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[
                    "My hours this week",
                    "Upcoming holidays",
                    "Who is in office today?",
                    "Apply sick leave tomorrow because flu",
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleChipClick(chip)}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {renderResultCard()}
          </div>
        )}
      </>
    );
  }

  // --- 2. SIDEBAR VARIANT (Pinned to bottom of left menu) ---
  if (variant === "sidebar") {
    return (
      <div className="mt-auto border-t border-slate-200 pt-4 px-1">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            <span className="text-xs font-bold text-slate-800">AI Assistant</span>
          </div>
          <div className="mb-2">
            {renderPositionSwitcher(true)}
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-indigo-200/80 bg-white px-2 py-1.5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-hidden"
              id="assistant-sidebar-input"
            />
            <button
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
              className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Search className="h-2.5 w-2.5" />}
            </button>
          </div>

          {result && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-700 uppercase">{result.intent}</span>
                <button onClick={() => setResult(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600 line-clamp-3">{result.answer}</p>
              {result.action_url && (
                <button
                  onClick={() => navigate(result.action_url as string)}
                  className="mt-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  View Details &rarr;
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- 3. NAVBAR VARIANT (Top Navbar) ---
  return (
    <div className="relative w-80">
      <div className="flex items-center gap-2 rounded-xl border border-indigo-200/80 bg-indigo-50/40 px-3 py-1.5 shadow-2xs transition focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100">
        <Sparkles className="h-4 w-4 shrink-0 text-indigo-600 animate-pulse" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI Assistant (or click switch)..."
          className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-hidden"
          id="assistant-query-input"
        />
        <button
          onClick={() => setShowPositionMenu(!showPositionMenu)}
          className="rounded p-0.5 text-slate-400 hover:bg-indigo-100 hover:text-indigo-700"
          title="Switch Position"
        >
          <Layers className="h-3.5 w-3.5" />
        </button>
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

      {/* Position Switcher Dropdown */}
      {showPositionMenu && (
        <div className="absolute top-11 right-0 z-50 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
            <span className="text-xs font-bold text-slate-800">Switch Assistant Position</span>
            <button onClick={() => setShowPositionMenu(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {renderPositionSwitcher(true)}
        </div>
      )}

      {/* Interactive Result Popover */}
      {isOpen && result && (
        <div className="absolute top-11 right-0 z-50 w-96 rounded-2xl border border-indigo-100 bg-white p-4 shadow-xl shadow-indigo-100/40">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-indigo-700 uppercase">
                {result.intent}
              </span>
              <h4 className="mt-1 text-sm font-semibold text-slate-900">{result.headline}</h4>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-2 border-b border-slate-100 pb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium text-slate-400 uppercase">Reposition</span>
            {renderPositionSwitcher()}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-600">{result.answer}</p>

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
