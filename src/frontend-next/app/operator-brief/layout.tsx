import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Operator Brief",
  description:
    "Shift-handover briefing summarising grid status, priority actions and the main risk drivers.",
  alternates: { canonical: "/operator-brief" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
