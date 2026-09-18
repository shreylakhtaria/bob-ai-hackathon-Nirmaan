"use client";

import React, { useState } from "react";
import { Terminal, Send, Bot, User as UserIcon, Sparkles, AlertTriangle } from "lucide-react";
import { API } from "@/lib/api";

interface Message {
  sender: "user" | "bot";
  text: string;
  evidence?: string[];
  recommendedAction?: string;
}

const QUICK_PROMPTS = [
  "What happens if transformer T-1024 fails?",
  "Which geographic areas are most weather-exposed?",
  "Summarize today's shift operational priorities",
  "Where should field crews be pre-positioned?",
];

export default function CopilotPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "bot",
      text: "Grid AI Copilot online. I am synced with the live SCADA telemetry feed, LightGBM risk models, and outage contingency solver. How can I assist your shift?",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

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
        {
          sender: "bot",
          text: `Inference error: ${e.message || "Unable to reach Watsonx LLM service. Falling back to local heuristics."}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-line mb-2.5">
        <div>
          <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
            <span>Decision Support</span>
            <span className="text-line">/</span>
            <span className="text-brand-ink font-bold">AI Operations Copilot</span>
          </div>
          <h1 className="text-title font-bold text-ink tracking-tight font-sans">
            SCADA &amp; Outage Advisory Copilot
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 bg-sev-normal-tint text-sev-normal px-2.5 py-0.5 rounded-full font-mono text-micro font-bold">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          LLM Synced with Real-Time SCADA
        </span>
      </div>

      {/* Suggested Prompt Chips */}
      <div className="flex flex-wrap items-center gap-1.5 pb-2.5">
        <span className="text-micro text-ink-3 uppercase font-semibold mr-1">Suggested:</span>
        {QUICK_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            onClick={() => sendMessage(prompt)}
            className="px-2.5 py-1 bg-sunken hover:bg-header text-ink rounded-full border border-line font-sans text-micro transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Area */}
      <div className="flex-1 bg-panel rounded-lg border border-line shadow-panel p-4 overflow-y-auto flex flex-col gap-3">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex gap-2.5 max-w-[85%] ${m.sender === "user" ? "self-end flex-row-reverse" : "self-start"}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                m.sender === "user" ? "bg-brand-ink text-white" : "bg-brand text-white"
              }`}
            >
              {m.sender === "user" ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div
              className={`p-3 rounded-xl text-label leading-relaxed ${
                m.sender === "user"
                  ? "bg-brand-ink text-white rounded-br-none"
                  : "bg-sunken text-ink border border-line rounded-bl-none"
              }`}
            >
              <div className="whitespace-pre-line">{m.text}</div>
              {m.recommendedAction && (
                <div className="mt-2 p-2 bg-sev-normal-tint/40 border border-brand/30 rounded font-mono text-micro text-sev-normal font-semibold">
                  &rsaquo; Action: {m.recommendedAction}
                </div>
              )}
              {m.evidence && m.evidence.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-line font-mono text-micro text-ink-3">
                  Evidence: {m.evidence.join(" • ")}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="self-start flex items-center gap-2 p-3 bg-sunken rounded-xl text-label text-ink-3 italic font-mono">
            <Bot className="w-4 h-4 animate-bounce text-brand" />
            Synthesizing telemetry &amp; calculating outage risk…
          </div>
        )}
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="mt-2.5 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot about asset health, storm exposure, or crew dispatch orders…"
          className="flex-1 h-9 px-3 bg-sunken rounded-lg border border-line focus:bg-panel focus:ring-1 focus:ring-brand text-label"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="h-9 px-4 bg-brand text-white rounded-lg text-micro font-semibold uppercase hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50 shadow-panel"
        >
          <Send className="w-3.5 h-3.5" /> Send
        </button>
      </form>
    </div>
  );
}
