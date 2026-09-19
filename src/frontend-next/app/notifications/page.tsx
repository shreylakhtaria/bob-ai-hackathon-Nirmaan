"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  InlineNotification,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
  Toggle,
} from "@carbon/react";
import { Help, Renew, Send } from "@carbon/icons-react";
import { PanelCard } from "@/components/common/PanelCard";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import type { DeliveryStatus, NotificationDelivery } from "@/types/grid";

/** Delivery status → Carbon tag colour, on the same severity ramp as the rest
 *  of the console: red means something did not reach anyone. */
const STATUS_TAG: Record<DeliveryStatus, "green" | "red" | "warm-gray" | "cool-gray"> = {
  SENT: "green",
  FAILED: "red",
  PENDING: "warm-gray",
  SENDING: "warm-gray",
  SKIPPED: "cool-gray",
  DISABLED: "cool-gray",
};

const CHANNEL_STATE: Record<string, { tag: "green" | "red" | "warm-gray" | "cool-gray"; label: string }> = {
  ready: { tag: "green", label: "Telegram Connected" },
  disabled: { tag: "cool-gray", label: "Telegram Disabled" },
  misconfigured: { tag: "warm-gray", label: "Telegram Misconfigured" },
};

function when(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB", { hour12: false });
}

export default function NotificationsPage() {
  const { ok, err, warn } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);

  const status = useQuery({
    queryKey: ["notification-status"],
    queryFn: () => API.notificationStatus(),
  });

  const history = useQuery({
    queryKey: ["notification-deliveries", failedOnly],
    queryFn: () => API.deliveries(50, failedOnly ? "FAILED" : undefined),
  });

  const refresh = () => {
    status.refetch();
    history.refetch();
  };

  const runTest = async () => {
    setBusy("test");
    try {
      const res = await API.telegramTest();
      if (res.success) ok(`Test message delivered (id ${res.delivery.provider_message_id}).`);
      // A non-throwing failure still failed: say so rather than showing success.
      else err(res.delivery.error_message || "Telegram did not accept the message.");
    } catch (e: unknown) {
      err(e instanceof Error ? e.message : "Test notification failed");
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const retry = async (delivery: NotificationDelivery) => {
    setBusy(delivery.delivery_id);
    try {
      const res = await API.retryDelivery(delivery.delivery_id);
      if (res.success) ok(`Delivery ${delivery.delivery_id} sent.`);
      else warn(res.delivery.error_message || "Retry did not succeed.");
    } catch (e: unknown) {
      err(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const sendBrief = async () => {
    setBusy("brief");
    try {
      const res = await API.sendBriefing();
      if (res.success) ok("Operations briefing sent to Telegram.");
      else err(res.delivery.error_message || "Briefing was not delivered.");
    } catch (e: unknown) {
      err(e instanceof Error ? e.message : "Briefing send failed");
    } finally {
      setBusy(null);
      refresh();
    }
  };

  if (status.isLoading) return <ScadaSkeletonLoader />;

  // Without this the page renders its zero-state on an API failure: "Telegram
  // Disabled", 0 delivered, 0 failed — indistinguishable from a healthy channel
  // that has simply never sent anything. Say the numbers are unavailable.
  if (status.isError) {
    return (
      <div className="flex flex-col gap-3 w-full animate-fade-in font-sans">
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Notification status unavailable"
          subtitle={
            status.error instanceof Error
              ? status.error.message
              : "The API did not answer /api/notifications/status."
          }
        />
        <div>
          <Button kind="tertiary" size="sm" renderIcon={Renew} onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const tg = status.data?.telegram;
  const state = CHANNEL_STATE[tg?.state ?? "disabled"] ?? {
    tag: "red" as const, label: "Telegram Error",
  };
  const ready = !!tg?.enabled && !!tg?.configured;
  const deliveries = history.data?.deliveries ?? [];

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
            <span>Operations</span>
            <span className="text-line">/</span>
            <span className="text-brand-ink font-bold">Alert Notifications</span>
          </div>
          <h1 className="text-title font-bold text-ink tracking-tight">Alert Notifications</h1>
          <p className="text-label text-ink-2">
            Live Telegram delivery of {tg?.notify_priorities?.join(" and ") || "urgent"} grid
            alerts, with the full delivery record behind each one.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button kind="ghost" size="sm" renderIcon={Help} onClick={() => setHelpOpen(true)}>
            Setup help
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={Renew} onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2.5">
        <Tile>
          <div className="text-micro text-ink-3 uppercase tracking-wide">Channel</div>
          <div className="mt-1.5">
            <Tag type={state.tag} size="md">{state.label}</Tag>
          </div>
          {!!tg?.missing?.length && (
            <div className="mt-2 text-micro text-ink-3">Missing: {tg.missing.join(", ")}</div>
          )}
        </Tile>
        <Tile>
          <div className="text-micro text-ink-3 uppercase tracking-wide">Delivered</div>
          <div className="font-mono text-metric font-semibold text-ink leading-none mt-1">
            {status.data?.deliveries.sent ?? 0}
          </div>
          <div className="mt-1 text-micro text-ink-3">
            of {status.data?.deliveries.total ?? 0} attempts
          </div>
        </Tile>
        <Tile>
          <div className="text-micro text-ink-3 uppercase tracking-wide">Failed</div>
          <div className="font-mono text-metric font-semibold text-sev-critical leading-none mt-1">
            {status.data?.deliveries.failed ?? 0}
          </div>
          <div className="mt-1 text-micro text-ink-3">retryable below</div>
        </Tile>
        <Tile>
          <div className="text-micro text-ink-3 uppercase tracking-wide">Duplicate window</div>
          <div className="font-mono text-metric font-semibold text-ink leading-none mt-1">
            {tg?.dedup_window_minutes ?? 0}m
          </div>
          <div className="mt-1 text-micro text-ink-3">
            {tg?.max_retries ?? 0} retries · {tg?.timeout_seconds ?? 0}s timeout
          </div>
        </Tile>
      </div>

      {!ready && (
        <InlineNotification
          kind={tg?.state === "misconfigured" ? "warning" : "info"}
          lowContrast
          hideCloseButton
          title={
            tg?.state === "misconfigured"
              ? "Telegram is enabled but not configured"
              : "Telegram notifications are off"
          }
          subtitle={
            tg?.state === "misconfigured"
              ? `Set ${tg?.missing?.join(" and ")} in src/.env and restart the API.`
              : "Set TELEGRAM_ENABLED=true in src/.env and restart the API. Alerts still appear in the console meanwhile."
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          renderIcon={Send}
          disabled={!ready || busy !== null}
          onClick={runTest}
        >
          {busy === "test" ? "Sending…" : "Send test notification"}
        </Button>
        <Button
          kind="tertiary"
          size="sm"
          disabled={!ready || busy !== null}
          onClick={sendBrief}
        >
          {busy === "brief" ? "Sending…" : "Send operations briefing"}
        </Button>
        <div className="ml-auto">
          <Toggle
            id="failed-only"
            size="sm"
            labelText=""
            labelA="All deliveries"
            labelB="Failed only"
            toggled={failedOnly}
            onToggle={setFailedOnly}
          />
        </div>
      </div>

      <PanelCard
        title="Delivery history"
        hint="Every attempt is recorded — including the ones that were suppressed as duplicates."
        flush
      >
        <div className="overflow-x-auto">
          <Table size="sm" useZebraStyles={false}>
            <TableHead>
              <TableRow>
                <TableHeader>Time</TableHeader>
                <TableHeader>Alert</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader>Channel</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="text-right">Attempts</TableHeader>
                <TableHeader>Result</TableHeader>
                <TableHeader className="text-right">Action</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.delivery_id}>
                  <TableCell className="font-mono text-micro whitespace-nowrap">
                    {when(d.created_at)}
                  </TableCell>
                  <TableCell className="font-mono text-micro">
                    {d.alert_id || <span className="text-ink-3">{d.kind}</span>}
                  </TableCell>
                  <TableCell>
                    {d.priority ? <Tag type="cool-gray" size="sm">{d.priority}</Tag> : "—"}
                  </TableCell>
                  <TableCell className="text-micro">
                    {d.channel} <span className="text-ink-3">{d.destination}</span>
                  </TableCell>
                  <TableCell>
                    <Tag type={STATUS_TAG[d.status] ?? "cool-gray"} size="sm">{d.status}</Tag>
                  </TableCell>
                  <TableCell className="text-right font-mono">{d.attempt_count}</TableCell>
                  <TableCell className="text-micro max-w-[22rem]">
                    {d.status === "SENT" ? (
                      <span className="font-mono text-ink-3">id {d.provider_message_id}</span>
                    ) : (
                      <span className="text-ink-2">{d.error_message || "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {d.status === "FAILED" && (
                      <Button
                        kind="ghost"
                        size="sm"
                        disabled={!ready || busy !== null}
                        onClick={() => retry(d)}
                      >
                        {busy === d.delivery_id ? "Retrying…" : "Retry"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {deliveries.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-label font-medium text-ink">No deliveries yet</p>
              <p className="mt-0.5 text-micro text-ink-3">
                Alerts are pushed as they are generated, or send one from the Overview page.
              </p>
            </div>
          )}
        </div>
      </PanelCard>

      <Modal
        open={helpOpen}
        onRequestClose={() => setHelpOpen(false)}
        modalHeading="Connect Telegram"
        modalLabel="Setup"
        passiveModal
        size="sm"
      >
        <ol className="space-y-2 text-label text-ink">
          <li>1. In Telegram, search for <b>@BotFather</b> and run <code>/newbot</code>.</li>
          <li>2. Choose a name and username, then copy the bot token it gives you.</li>
          <li>3. Open your new bot and press <b>Start</b> (a bot cannot message you first).</li>
          <li>
            4. Get your chat id from{" "}
            <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> — read{" "}
            <code>result[0].message.chat.id</code>.
          </li>
          <li>
            5. Put both in <code>src/.env</code>:
            <pre className="mt-1 p-2 bg-sunken text-micro font-mono overflow-x-auto">{`TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<your token>
TELEGRAM_DEFAULT_CHAT_ID=<your chat id>
PUBLIC_APP_URL=http://localhost:3000`}</pre>
          </li>
          <li>6. Restart the API, then press <b>Send test notification</b> above.</li>
        </ol>
        <p className="mt-3 text-micro text-ink-3">
          The token is read by the server only. It is never sent to this page, stored in the
          database, or written to a log — and <code>.env</code> is git-ignored.
        </p>
      </Modal>
    </div>
  );
}
