import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Interactive Grid Map",
  description:
    "Geographic view of asset risk, area weather overlays and live crew positions across the network.",
  alternates: { canonical: "/grid-map" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
