import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Operations Overview",
  description:
    "Live grid risk overview: overall risk level, critical and high-risk assets, predicted failures and customers at risk.",
  alternates: { canonical: "/overview" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
