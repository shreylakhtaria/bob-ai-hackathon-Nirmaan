import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Alert Notifications",
  description:
    "Telegram delivery status and history for critical and high-priority grid alerts.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
