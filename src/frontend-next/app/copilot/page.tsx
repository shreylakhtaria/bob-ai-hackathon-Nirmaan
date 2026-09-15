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
      <div className="flex items-center justify-between pb-2 border-b border-[#c0c9c0]/60 mb-2.5">
        <div>
          <div className="flex items-center gap-1 font-mono text-[10.5px] text-[#707971] uppercase tracking-wider mb-0.5">
            <span>Decision Support</span>
            <span className="text-[#c0c9c0]">/</span>
            <span className="text-[#003820] font-bold">AI Operations Copilot</span>
          </div>
          <h1 className="text-[20px] font-bold text-[#0b1c30] tracking-tight font-sans">
            SCADA &amp; Outage Advisory Copilot
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 bg-[#baeed9] text-[#002117] px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold">
          <Sparkles className="w-3.5 h-3.5 text-[#0f5132]" />
          LLM Synced with Real-Time SCADA
        </span>
      </div>

      {/* Suggested Prompt Chips */}
      <div className="flex flex-wrap items-center gap-1.5 pb-2.5">
        <span className="font-mono text-[10.5px] text-[#707971] uppercase font-bold mr-1">Suggested:</span>
        {QUICK_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            onClick={() => sendMessage(prompt)}
            className="px-2.5 py-1 bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0b1c30] rounded-full border border-[#c0c9c0]/60 font-sans text-[11px] transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Area */}
      <div className="flex-1 bg-white rounded-lg border border-[#c0c9c0]/60 shadow-sm p-4 overflow-y-auto flex flex-col gap-3">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex gap-2.5 max-w-[85%] ${m.sender === "user" ? "self-end flex-row-reverse" : "self-start"}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                m.sender === "user" ? "bg-[#003820] text-white" : "bg-[#0f5132] text-white"
              }`}
            >
              {m.sender === "user" ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div
              className={`p-3 rounded-xl text-[12.5px] leading-relaxed ${
                m.sender === "user"
                  ? "bg-[#003820] text-white rounded-br-none"
                  : "bg-[#eff4ff] text-[#0b1c30] border border-[#c0c9c0]/60 rounded-bl-none"
              }`}
            >
              <div className="whitespace-pre-line">{m.text}</div>
              {m.recommendedAction && (
                <div className="mt-2 p-2 bg-[#baeed9]/40 border border-[#0f5132]/30 rounded font-mono text-[11px] text-[#002117] font-semibold">
                  &rsaquo; Action: {m.recommendedAction}
                </div>
              )}
              {m.evidence && m.evidence.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-[#c0c9c0]/50 font-mono text-[10px] text-[#707971]">
                  Evidence: {m.evidence.join(" • ")}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="self-start flex items-center gap-2 p-3 bg-[#eff4ff] rounded-xl text-[12px] text-[#707971] italic font-mono">
            <Bot className="w-4 h-4 animate-bounce text-[#0f5132]" />
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
          className="flex-1 h-9 px-3 bg-[#eff4ff] rounded-lg border border-[#c0c9c0]/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f5132] text-[12.5px]"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="h-9 px-4 bg-[#0f5132] text-white rounded-lg font-mono text-[11.5px] font-bold uppercase hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
        >
          <Send className="w-3.5 h-3.5" /> Send
        </button>
      </form>
    </div>
  );
}
