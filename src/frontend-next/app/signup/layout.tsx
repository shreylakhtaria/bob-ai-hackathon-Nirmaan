import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register Account",
  description:
    "Register for an Operator or Field Crew account on the Grid Risk Command Center console.",
  alternates: { canonical: "/signup" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
