import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Maintenance Queue",
  description:
    "Maintenance work ranked by Grid Impact Score rather than raw failure probability, so the highest-consequence jobs surface first.",
  alternates: { canonical: "/maintenance" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
