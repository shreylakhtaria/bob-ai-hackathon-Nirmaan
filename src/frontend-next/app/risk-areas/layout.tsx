import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Risk & Areas",
  description:
    "Area-level outage probability, weather exposure and the contributing risk factors driving each geographic zone.",
  alternates: { canonical: "/risk-areas" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
