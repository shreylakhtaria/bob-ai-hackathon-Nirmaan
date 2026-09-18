import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Field Crews",
  description:
    "Field crew roster, availability and optimiser-recommended pre-positioning ahead of forecast severe weather.",
  alternates: { canonical: "/crews" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
