"use client";

import React, { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bot, Send, X, Sparkles, Maximize2 } from "lucide-react";
import { API } from "@/lib/api";

interface Message {
  sender: "user" | "bot";
  text: string;
  evidence?: string[];
  recommendedAction?: string;
}

/**
 * Compact copilot chat available from every authenticated page, so an
 * operator can ask a question without navigating away from what they're
 * looking at. Shares the same /api/copilot/query endpoint as the full
 * /copilot page — this is a lighter-weight surface onto the same feature,
 * not a second implementation of it.
 */
export const FloatingCopilot: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { sender: "bot", text: "Ask me about any asset, area, or what-if scenario — I'll cite the data behind the answer." },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Don't float a second copilot entry point on top of the full copilot page,
  // and never show it on the auth pages (no sidebar/topbar chrome there either).
  if (pathname === "/copilot" || pathname === "/login" || pathname === "/signup") {
    return null;
  }

  const sendMessage = async (queryText: string) => {
    const q = queryText.trim();
    if (!q || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { sender: "user", text: q }]);
    setIsLoading(true);

    try {
      const res = await API.copilot(q);
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: res.answer || "Operational assessment generated.",
          evidence: res.evidence,
          recommendedAction: res.recommended_action,
        },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: `Inference error: ${e.message || "Unable to reach the copilot service."}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5">
      {open && (
        <div className="w-[360px] h-[460px] bg-white rounded-xl border border-[#c0c9c0] shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          <div className="h-11 px-3.5 bg-[#003820] text-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-[#baeed9]" />
              Grid Copilot
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/copilot");
                }}
                title="Open full copilot"
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close"
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 bg-[#f8f9ff]">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-2 max-w-[88%] ${m.sender === "user" ? "self-end flex-row-reverse" : "self-start"}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    m.sender === "user" ? "bg-[#003820] text-white" : "bg-[#0f5132] text-white"
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div
                  className={`p-2.5 rounded-lg text-[12px] leading-relaxed ${
                    m.sender === "user"
                      ? "bg-[#003820] text-white rounded-br-none"
                      : "bg-white text-[#0b1c30] border border-[#c0c9c0]/60 rounded-bl-none"
                  }`}
                >
                  <div className="whitespace-pre-line">{m.text}</div>
                  {m.recommendedAction && (
                    <div className="mt-1.5 p-1.5 bg-[#baeed9]/40 border border-[#0f5132]/30 rounded font-mono text-[10px] text-[#002117] font-semibold">
                      &rsaquo; {m.recommendedAction}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="self-start flex items-center gap-2 p-2 text-[11px] text-[#707971] italic font-mono">
                <Bot className="w-3.5 h-3.5 animate-bounce text-[#0f5132]" />
                thinking…
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="p-2.5 border-t border-[#c0c9c0]/60 flex gap-1.5 flex-shrink-0 bg-white"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              className="flex-1 h-8 px-2.5 bg-[#eff4ff] rounded-md border border-[#c0c9c0]/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f5132] text-[12px]"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="w-8 h-8 flex-shrink-0 bg-[#0f5132] text-white rounded-md flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        title="Grid Copilot"
        className="w-12 h-12 rounded-full bg-[#0f5132] text-white shadow-lg hover:opacity-90 transition-all flex items-center justify-center border-2 border-white"
      >
        {open ? <X className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
      </button>
    </div>
  );
};
