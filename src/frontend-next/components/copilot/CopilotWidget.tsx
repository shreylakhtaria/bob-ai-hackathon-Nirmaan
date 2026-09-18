"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Trash2, Loader2 } from "lucide-react";
import { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export interface CopilotMessage {
  sender: "user" | "bot";
  text: string;
  evidence?: { tool: string }[];
  recommendedAction?: string;
  failed?: boolean;
}

const GREETING: CopilotMessage = {
  sender: "bot",
  text:
    "Grid copilot ready. Ask about asset risk, weather exposure, crew positioning, " +
    "or run a what-if. Every answer is grounded in current model output.",
};

const QUICK_PROMPTS = [
  "Why is T-1024 critical?",
  "Which areas are most weather exposed?",
  "Where should crews be pre-positioned?",
];

/**
 * The model answers in light markdown: **bold**, `code`, "### headings",
 * "> " callouts, "- " bullets and "---" rules. Rendered raw, an operator sees
 * literal asterisks and hashes in the middle of a number, which reads like a
 * bug. This handles exactly the marks the answer prompt produces rather than
 * pulling in a markdown library — and it never injects HTML, so a
 * model-authored string cannot become markup.
 *
 * ponytail: intentionally not a markdown parser. If the prompt ever asks for
 * tables or links, swap in react-markdown rather than growing this.
 */
const inline = (line: string, key: string) => {
  // Split on **bold** and `code`, keeping the delimiters.
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${key}-${i}`} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${key}-${i}`} className="font-mono text-micro">{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>;
  });
};

const AnswerText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/\r?\n/).map((raw, i) => {
      const quote = /^\s*>\s?/.test(raw);
      const line = raw.replace(/^\s*>\s?/, "");
      if (!line.trim()) return <div key={i} className="h-2" aria-hidden="true" />;
      // A rule between sections: draw the rule, not three dashes.
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        return <hr key={i} className="my-2 border-line" />;
      }
      // The answer prompt asks for no tables — a real table is unreadable at
      // this width. If one arrives anyway, flatten the row instead of showing
      // raw pipes, and drop the |---|---| separator entirely.
      if (/^\s*\|/.test(line)) {
        const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return null;
        return (
          <p key={i} className="my-0.5">{inline(cells.join(" · "), `t${i}`)}</p>
        );
      }
      const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
      if (heading) {
        return (
          <p key={i} className="mt-2 mb-0.5 text-micro font-semibold uppercase tracking-wide text-ink-2">
            {inline(heading[2], `h${i}`)}
          </p>
        );
      }
      const bullet = /^\s*[-*]\s+/.test(line);
      const body = inline(line.replace(/^\s*[-*]\s+/, ""), `l${i}`);
      if (bullet) {
        return (
          <div key={i} className="flex gap-1.5">
            <span aria-hidden="true" className="text-ink-3">&bull;</span>
            <span>{body}</span>
          </div>
        );
      }
      return (
        <p key={i} className={quote ? "border-l-2 border-brand/40 pl-2 my-1" : undefined}>
          {body}
        </p>
      );
    })}
  </>
);

/**
 * Global copilot, available on every console page rather than only its own tab —
 * an operator asking "why is this critical?" is almost always already looking at
 * the thing they are asking about, and making them navigate away loses that.
 */
export const CopilotWidget: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CopilotMessage[]>([GREETING]);
  const [isLoading, setIsLoading] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes, and focus goes back to the launcher rather than being
  // dropped at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || isLoading) return;
      setInput("");
      setMessages((m) => [...m, { sender: "user", text: q }]);
      setIsLoading(true);
      try {
        const res = await API.copilot(q);
        setMessages((m) => [
          ...m,
          {
            sender: "bot",
            text: res.answer,
            evidence: res.evidence,
            recommendedAction: res.recommended_action,
          },
        ]);
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            sender: "bot",
            failed: true,
            text: e instanceof Error ? e.message : "The copilot is unavailable right now.",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  // Signed-out visitors have no console to ask about, and every copilot call
  // would 401 anyway.
  if (!isAuthenticated) return null;

  return (
    <>
      {!open && (
        <button
          ref={launcherRef}
          onClick={() => setOpen(true)}
          aria-label="Open grid copilot"
          // Bottom-left: the bottom-right corner is where the metrics drawer and
          // table action buttons live, and covering those costs more than it saves.
          className="fixed bottom-5 left-5 z-[60] h-12 w-12 rounded-full bg-brand text-white shadow-overlay flex items-center justify-center hover:bg-brand-ink focus-visible:outline-none"
        >
          <MessageSquare className="w-5 h-5" aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Grid operations copilot"
          aria-modal="false"
          className="fixed bottom-5 left-5 z-[60] flex flex-col w-[min(24rem,calc(100vw-2.5rem))] h-[min(32rem,calc(100vh-6rem))] rounded-xl border border-line bg-panel shadow-overlay animate-fade-in"
        >
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-line">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-sev-normal shrink-0" aria-hidden="true" />
              <span className="text-label font-semibold text-ink truncate">Grid copilot</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([GREETING])}
                aria-label="Clear conversation"
                title="Clear conversation"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-ink hover:bg-sunken"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => { setOpen(false); launcherRef.current?.focus(); }}
                aria-label="Close copilot"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-ink hover:bg-sunken"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* aria-live so answers are announced; the page does not move focus. */}
          <div
            ref={logRef}
            aria-live="polite"
            className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5"
          >
            {messages.map((m, i) => (
              <div key={i} className={m.sender === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[88%] rounded-xl px-3 py-2 text-label leading-relaxed break-words ${
                    m.sender === "user"
                      ? "bg-brand text-white rounded-br-sm"
                      : m.failed
                        ? "bg-sev-critical-tint text-ink border border-sev-critical/30 rounded-bl-sm"
                        : "bg-sunken text-ink border border-line rounded-bl-sm"
                  }`}
                >
                  <AnswerText text={m.text} />
                  {m.recommendedAction && (
                    <div className="mt-2 pt-2 border-t border-line/60 text-micro font-semibold text-brand-ink">
                      &rsaquo; {m.recommendedAction}
                    </div>
                  )}
                  {m.evidence && m.evidence.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-line/60 font-mono text-micro text-ink-3">
                      Evidence: {m.evidence.map((e) => e.tool).join(" • ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-micro text-ink-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Reading current model output&hellip;
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="px-3.5 pb-2 flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-full border border-line bg-sunken px-2.5 py-1 text-micro text-ink-2 hover:border-brand hover:text-ink"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2 border-t border-line p-2.5"
          >
            <label htmlFor="copilot-input" className="sr-only">Ask the grid copilot</label>
            <input
              id="copilot-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about assets, risk or crews&hellip;"
              className="flex-1 min-w-0 min-h-9 px-3 rounded-lg border border-line-strong bg-canvas text-ink text-label"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              aria-label="Send"
              className="h-9 w-9 shrink-0 rounded-lg bg-brand text-white flex items-center justify-center disabled:opacity-40 hover:bg-brand-ink"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
