"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  ContentSwitcher,
  InlineNotification,
  Modal,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
  Toggle,
} from "@carbon/react";
import { Email, Help, Renew, Send, UserMultiple, View } from "@carbon/icons-react";
import { PanelCard } from "@/components/common/PanelCard";
import { ScadaSkeletonLoader } from "@/components/common/ScadaSkeletonLoader";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { API } from "@/lib/api";
import type { DeliveryStatus, NotificationDelivery } from "@/types/grid";

/** Delivery status → Carbon tag colour */
const STATUS_TAG: Record<DeliveryStatus, "green" | "red" | "warm-gray" | "cool-gray"> = {
  SENT: "green",
  FAILED: "red",
  PENDING: "warm-gray",
  SENDING: "warm-gray",
  SKIPPED: "cool-gray",
  DISABLED: "cool-gray",
};

function when(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB", { hour12: false });
}

import { useRouter } from "next/navigation";

export default function NotificationsPage() {
  const router = useRouter();
  const { ok, err, warn } = useToast();
  const { user } = useAuth();
  const isOperatorOrAdmin = user?.role === "admin" || user?.role === "operator";

  React.useEffect(() => {
    if (user?.role === "crew") {
      warn("Notifications center is restricted to Control Room Operators");
      router.replace("/crews");
    }
  }, [user?.role, router, warn]);

  if (user?.role === "crew") {
    return null;
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);

  // Email preview modal state
  const [previewDelivery, setPreviewDelivery] = useState<NotificationDelivery | null>(null);
  const [previewTab, setPreviewTab] = useState<"html" | "text">("html");

  // Custom test recipient state
  const [showCustomTest, setShowCustomTest] = useState(false);
  const [customRecipient, setCustomRecipient] = useState("");

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

  const runTest = async (targetEmail?: string) => {
    setBusy("test");
    try {
      const recipient = targetEmail && targetEmail.trim() ? targetEmail.trim() : undefined;
      const res = await API.emailTest(recipient);
      if (res.success) {
        const mode = res.delivery.delivery_mode;
        if (mode === "smtp") {
          ok(`Test email sent via live SMTP relay to ${res.delivery.destination || "operators"}!`);
        } else {
          ok(
            `Test email rendered & recorded in Direct Dispatch mode (id ${res.delivery.provider_message_id || res.delivery.delivery_id}). Click 'Preview' to view the rendered template.`
          );
        }
      } else {
        err(res.delivery.error_message || "Could not dispatch test email.");
      }
    } catch (e: unknown) {
      err(e instanceof Error ? e.message : "Test email notification failed");
    } finally {
      setBusy(null);
      setShowCustomTest(false);
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
      if (res.success) {
        const mode = res.delivery.delivery_mode;
        if (mode === "smtp") {
          ok("Operations briefing email delivered via SMTP relay.");
        } else {
          ok("Operations briefing email rendered and recorded in Direct Dispatch mode. Click 'Preview' to view.");
        }
      } else {
        err(res.delivery.error_message || "Briefing email was not delivered.");
      }
    } catch (e: unknown) {
      err(e instanceof Error ? e.message : "Briefing send failed");
    } finally {
      setBusy(null);
      refresh();
    }
  };

  if (status.isLoading) return <ScadaSkeletonLoader />;

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

  const emailInfo = status.data?.email || status.data?.telegram;
  const ready = emailInfo?.enabled !== false;
  const isSmtp = emailInfo?.mode === "smtp";
  const recipients = emailInfo?.recipients || [];
  const deliveries = history.data?.deliveries ?? [];

  return (
    <div className="flex flex-col gap-3.5 w-full animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-1 text-micro text-ink-3 uppercase tracking-wider mb-0.5">
            <span>Operations</span>
            <span className="text-line">/</span>
            <span className="text-brand-ink font-bold">Alert Notifications</span>
          </div>
          <h1 className="text-title font-bold text-ink tracking-tight flex items-center gap-2">
            <Email size={22} className="fill-current text-brand-ink" aria-hidden="true" />
            Direct Email Notifications
          </h1>
          <p className="text-label text-ink-2">
            Automated direct email delivery of critical grid alerts and operations briefings to designated dispatchers.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button kind="ghost" size="sm" renderIcon={Help} onClick={() => setHelpOpen(true)}>
            Email config
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={Renew} onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Mode awareness banner */}
      {!isSmtp && (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Direct Dispatch Mode (Integrated Local Engine)"
          subtitle="Alert and briefing emails are fully rendered with branded HTML templates and logged locally with full audit trails. Because external SMTP is not yet configured in src/.env, dispatches do not reach real email inboxes. Click 'Preview' on any delivery below to view the rendered HTML message, or click 'Email config' to set up your SMTP relay (Gmail, SendGrid, etc.)."
        />
      )}

      {/* Top metric tiles */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2.5">
        <Tile>
          <div className="text-micro text-ink-3 uppercase tracking-wide">Channel Status</div>
          <div className="mt-1.5 flex items-center gap-2">
            <Tag type={!ready ? "cool-gray" : isSmtp ? "green" : "blue"} size="md">
              {!ready ? "Disabled" : isSmtp ? "Live SMTP Active" : "Direct Dispatch"}
            </Tag>
          </div>
          <div className="mt-2 text-micro text-ink-3">
            Mode: <span className="font-semibold text-ink">{isSmtp ? "Live External SMTP Relay" : "Local Direct Dispatch"}</span>
          </div>
        </Tile>
        <Tile>
          <div className="text-micro text-ink-3 uppercase tracking-wide">Dispatches Recorded</div>
          <div className="font-mono text-metric font-semibold text-ink leading-none mt-1">
            {status.data?.deliveries.sent ?? 0}
          </div>
          <div className="mt-1 text-micro text-ink-3">
            of {status.data?.deliveries.total ?? 0} total dispatches
          </div>
        </Tile>
        <Tile>
          <div className="text-micro text-ink-3 uppercase tracking-wide">Target Dispatchers</div>
          <div className="font-mono text-metric font-semibold text-ink leading-none mt-1">
            {recipients.length || 1}
          </div>
          <div className="mt-1 text-micro text-ink-3">active operators &amp; admins</div>
        </Tile>
        <Tile>
          <div className="text-micro text-ink-3 uppercase tracking-wide">Deduplication Window</div>
          <div className="font-mono text-metric font-semibold text-ink leading-none mt-1">
            {emailInfo?.dedup_window_minutes ?? 30}m
          </div>
          <div className="mt-1 text-micro text-ink-3">
            Suppresses duplicate alert bursts
          </div>
        </Tile>
      </div>

      {/* Recipient summary banner */}
      <div className="bg-panel border border-line p-3 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-label">
          <UserMultiple size={18} className="fill-current text-brand-ink shrink-0" />
          <div>
            <span className="font-semibold text-ink">Active Alert Recipients:</span>{" "}
            <span className="font-mono text-micro text-ink-2">
              {recipients.length > 0 ? recipients.join(", ") : "lead.dispatcher@example.com"}
            </span>
          </div>
        </div>
        <div className="text-micro text-ink-3">
          Sourced from <code className="bg-sunken px-1 rounded">ADMIN_EMAILS</code> &amp; active database accounts
        </div>
      </div>

      {/* Actions and Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {isOperatorOrAdmin && (
          <>
            <Button
              size="sm"
              renderIcon={Send}
              disabled={!ready || busy !== null}
              onClick={() => runTest()}
            >
              {busy === "test" ? "Sending…" : "Send test email notification"}
            </Button>
            <Button
              kind="secondary"
              size="sm"
              disabled={!ready || busy !== null}
              onClick={() => setShowCustomTest(!showCustomTest)}
            >
              {showCustomTest ? "Cancel custom recipient" : "Test with custom email…"}
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              disabled={!ready || busy !== null}
              onClick={sendBrief}
            >
              {busy === "brief" ? "Sending…" : "Send operations briefing email"}
            </Button>
          </>
        )}
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

      {/* Custom recipient input bar */}
      {showCustomTest && (
        <div className="p-3 bg-sunken border border-line rounded flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <div className="flex-1 w-full sm:w-auto">
            <TextInput
              id="custom-recipient-input"
              labelText="Recipient Email Address"
              placeholder="e.g. your-email@gmail.com"
              size="sm"
              value={customRecipient}
              onChange={(e) => setCustomRecipient(e.target.value)}
            />
          </div>
          <div className="self-end sm:self-auto pt-4 sm:pt-0">
            <Button
              size="sm"
              disabled={!customRecipient.trim() || busy !== null}
              onClick={() => runTest(customRecipient)}
            >
              Send test to this address
            </Button>
          </div>
        </div>
      )}

      {/* Deliveries History Table */}
      <PanelCard
        title="Email Delivery History &amp; Message Previews"
        hint="Every dispatched alert is recorded with timestamp, recipient list, delivery outcome, and full rendered email content."
        flush
      >
        <div className="overflow-x-auto">
          <Table size="sm" useZebraStyles={false}>
            <TableHead>
              <TableRow>
                <TableHeader>Time</TableHeader>
                <TableHeader>Alert / Event</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader>Transport</TableHeader>
                <TableHeader>Recipients</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.delivery_id}>
                  <TableCell className="font-mono text-micro whitespace-nowrap">
                    {when(d.created_at)}
                  </TableCell>
                  <TableCell className="font-mono text-micro">
                    <span className="font-semibold text-ink">{d.summary || d.alert_id || d.kind}</span>
                  </TableCell>
                  <TableCell>
                    {d.priority ? (
                      <Tag type={d.priority === "CRITICAL" ? "red" : d.priority === "HIGH" ? "warm-gray" : "cool-gray"} size="sm">
                        {d.priority}
                      </Tag>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-micro font-mono">
                    <Tag type={d.delivery_mode === "smtp" ? "green" : "blue"} size="sm">
                      {d.delivery_mode === "smtp" ? "SMTP RELAY" : "DIRECT DISPATCH"}
                    </Tag>
                  </TableCell>
                  <TableCell className="text-micro max-w-[16rem] truncate font-mono text-ink-3" title={d.destination || ""}>
                    {d.destination || "all operators"}
                  </TableCell>
                  <TableCell>
                    <Tag type={STATUS_TAG[d.status] ?? "cool-gray"} size="sm">{d.status}</Tag>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        kind="ghost"
                        size="sm"
                        renderIcon={View}
                        onClick={() => {
                          setPreviewDelivery(d);
                          setPreviewTab("html");
                        }}
                      >
                        Preview
                      </Button>
                      {d.status === "FAILED" && isOperatorOrAdmin && (
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={!ready || busy !== null}
                          onClick={() => retry(d)}
                        >
                          {busy === d.delivery_id ? "Retrying…" : "Retry"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {deliveries.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-label font-medium text-ink">No email deliveries recorded yet</p>
              <p className="mt-0.5 text-micro text-ink-3">
                Click "Send test email notification" above to test the delivery pipeline.
              </p>
            </div>
          )}
        </div>
      </PanelCard>

      {/* Email Preview Modal */}
      <Modal
        open={!!previewDelivery}
        onRequestClose={() => setPreviewDelivery(null)}
        modalHeading={previewDelivery?.subject || previewDelivery?.summary || "Email Notification Preview"}
        modalLabel={`Delivery ID: ${previewDelivery?.delivery_id || "N/A"} • Channel: Email`}
        passiveModal
        size="lg"
      >
        {previewDelivery && (
          <div className="space-y-3 font-sans">
            {/* Metadata Card */}
            <div className="p-3 bg-sunken rounded border border-line grid grid-cols-1 md:grid-cols-2 gap-2 text-label">
              <div>
                <span className="text-micro text-ink-3 uppercase block">Recipients</span>
                <span className="font-mono text-micro text-ink font-semibold break-all">
                  {previewDelivery.destination || "operators"}
                </span>
              </div>
              <div>
                <span className="text-micro text-ink-3 uppercase block">Dispatched Timestamp</span>
                <span className="font-mono text-micro text-ink">
                  {when(previewDelivery.sent_at || previewDelivery.created_at)}
                </span>
              </div>
              <div>
                <span className="text-micro text-ink-3 uppercase block">Transport Engine</span>
                <span className="flex items-center gap-1.5 mt-0.5">
                  <Tag type={previewDelivery.delivery_mode === "smtp" ? "green" : "blue"} size="sm">
                    {previewDelivery.delivery_mode === "smtp" ? "Live SMTP Relay" : "Direct Dispatch (Simulated)"}
                  </Tag>
                  <Tag type={STATUS_TAG[previewDelivery.status]} size="sm">
                    {previewDelivery.status}
                  </Tag>
                </span>
              </div>
              <div>
                <span className="text-micro text-ink-3 uppercase block">Message ID</span>
                <span className="font-mono text-micro text-ink-3 break-all">
                  {previewDelivery.provider_message_id || previewDelivery.delivery_id}
                </span>
              </div>
            </div>

            {/* Error banner if failed */}
            {previewDelivery.error_message && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Delivery Error"
                subtitle={previewDelivery.error_message}
              />
            )}

            {/* Content Switcher */}
            <div className="flex items-center justify-between pt-1">
              <ContentSwitcher
                size="sm"
                selectedIndex={previewTab === "html" ? 0 : 1}
                onChange={({ name }) => setPreviewTab((name as "html" | "text") ?? "html")}
              >
                <Switch name="html" text="Visual HTML Email" />
                <Switch name="text" text="Plain Text Version" />
              </ContentSwitcher>
              <span className="text-micro text-ink-3">
                Full-fidelity rendering
              </span>
            </div>

            {/* Preview Frame */}
            {previewTab === "html" ? (
              previewDelivery.rendered_html ? (
                <div className="border border-line rounded overflow-hidden shadow-sm bg-white">
                  <iframe
                    title="Email Preview"
                    srcDoc={previewDelivery.rendered_html}
                    className="w-full h-[460px] border-none"
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : (
                <div className="p-8 text-center text-ink-3 bg-sunken rounded border border-line">
                  HTML preview not available for this legacy record.
                </div>
              )
            ) : (
              <div className="border border-line rounded bg-panel overflow-hidden">
                <pre className="p-4 font-mono text-micro text-ink whitespace-pre-wrap max-h-[460px] overflow-y-auto leading-relaxed">
                  {previewDelivery.rendered_text || previewDelivery.summary || "No plain text content available."}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Email Configuration Modal */}
      <Modal
        open={helpOpen}
        onRequestClose={() => setHelpOpen(false)}
        modalHeading="Email Notification Configuration"
        modalLabel="Setup & Routing"
        passiveModal
        size="md"
      >
        <div className="space-y-4 text-label text-ink leading-relaxed">
          <p>
            The Grid Risk Command Center dispatches alert emails directly to verified operators and administrators.
          </p>

          <div className="p-3 bg-sunken rounded border border-line font-sans text-label space-y-2">
            <div className="font-semibold text-ink">1. Current Environment Status</div>
            <div className="grid grid-cols-2 gap-2 text-micro font-mono">
              <div>
                <span className="text-ink-3">Mode: </span>
                <span className="font-semibold text-ink">{emailInfo?.mode || "direct_dispatch"}</span>
              </div>
              <div>
                <span className="text-ink-3">Host: </span>
                <span className="text-ink">{emailInfo?.smtp_host || "Direct Dispatch"}</span>
              </div>
              <div>
                <span className="text-ink-3">Port: </span>
                <span className="text-ink">{emailInfo?.smtp_port || 587}</span>
              </div>
              <div>
                <span className="text-ink-3">From: </span>
                <span className="text-ink">{emailInfo?.smtp_from || "alerts@gridrisk.internal"}</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-sunken rounded border border-line font-sans text-label space-y-2">
            <div className="font-semibold text-ink">2. How are recipients selected?</div>
            <p className="text-micro text-ink-2">
              Alerts are automatically sent to all active accounts with the <strong>operator</strong> or <strong>admin</strong> role,
              plus any email listed in <code className="bg-panel px-1 rounded">ADMIN_EMAILS</code> or <code className="bg-panel px-1 rounded">EMAIL_RECIPIENTS</code> in <code className="bg-panel px-1 rounded">src/.env</code>.
            </p>
          </div>

          <div className="p-3 bg-sunken rounded border border-line font-sans text-label space-y-2">
            <div className="font-semibold text-ink">3. Real SMTP Setup (Gmail, Brevo, SendGrid, Amazon SES)</div>
            <p className="text-micro text-ink-2">
              To route emails directly to your personal inbox (e.g. Gmail), add these lines to <code className="bg-panel px-1 rounded">src/.env</code> and restart the backend:
            </p>
            <pre className="p-2 bg-panel rounded font-mono text-micro overflow-x-auto text-ink">{`# For Gmail (use a 16-character Google App Password):
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
SMTP_TLS=true
SMTP_FROM=your-email@gmail.com
EMAIL_RECIPIENTS=your-email@gmail.com`}</pre>
          </div>
        </div>
      </Modal>
    </div>
  );
}
