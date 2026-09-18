import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Operations Copilot",
  description:
    "Ask operational questions in plain language and get answers grounded in real model and database results, with the tool calls behind each answer.",
  alternates: { canonical: "/copilot" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
