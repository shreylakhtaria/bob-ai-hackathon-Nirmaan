import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What-If Simulation",
  description:
    "Model an asset failure or severe weather event and see customers affected, downstream assets, nearest crew and estimated outage duration.",
  alternates: { canonical: "/simulation" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
