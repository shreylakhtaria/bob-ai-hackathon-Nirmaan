import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request Operator Access",
  description:
    "Request an operator account for the Grid Risk Command Center console.",
  alternates: { canonical: "/signup" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
