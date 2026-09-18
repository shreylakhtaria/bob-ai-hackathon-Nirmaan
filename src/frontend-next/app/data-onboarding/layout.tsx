import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Onboarding",
  description:
    "Bulk-import crew and asset records from CSV. Every file is validated as a dry run first, so the operator sees exactly which rows would be written before anything is.",
  alternates: { canonical: "/data-onboarding" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
