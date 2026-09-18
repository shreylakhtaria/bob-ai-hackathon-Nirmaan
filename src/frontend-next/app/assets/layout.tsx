import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Asset Register & Diagnostics",
  description:
    "Searchable register of every monitored transformer, substation, feeder and switchgear, with failure probability, grid impact score and sensor telemetry.",
  alternates: { canonical: "/assets" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
