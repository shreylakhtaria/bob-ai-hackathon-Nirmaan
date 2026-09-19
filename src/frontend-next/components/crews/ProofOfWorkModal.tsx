"use client";

/**
 * ProofOfWorkModal — Field Crew Evidence & Resolution
 *
 * A 3-step Carbon Modal:
 *   Step 1 — Field Status: select the crew's current position in the workflow
 *             (DISPATCHED → EN_ROUTE → ON_SITE → RESOLVING → COMPLETED) and
 *             sync it to the linked enterprise ticket.
 *   Step 2 — Evidence: drag-and-drop real files from disk (PDF, PNG, JPG, CSV).
 *             No fake / placeholder entries — every file listed here is a real
 *             browser File object that will be uploaded to the backend.
 *   Step 3 — Resolution: action taken, parts replaced, additional notes,
 *             technician signature, then POST /work-orders/{id}/resolve which
 *             closes the work order, writes maintenance history, and triggers
 *             an ML re-score of the asset.
 */

import React, { useCallback, useRef, useState } from "react";
import {
  Button,
  InlineLoading,
  Modal,
  ProgressIndicator,
  ProgressStep,
  Tag,
  TextArea,
  TextInput,
} from "@carbon/react";
import {
  Attachment,
  CheckmarkFilled,
  TrashCan,
  Upload,
  WarningFilled,
} from "@carbon/icons-react";

import { API } from "@/lib/api";
import type { ResolutionResponse, WorkOrder } from "@/types/grid";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_STATUSES = [
  "DISPATCHED",
  "EN_ROUTE",
  "ON_SITE",
  "RESOLVING",
  "COMPLETED",
] as const;

type FieldStatus = (typeof FIELD_STATUSES)[number];

const STATUS_LABEL: Record<FieldStatus, string> = {
  DISPATCHED: "Dispatched",
  EN_ROUTE:   "En Route",
  ON_SITE:    "On Site",
  RESOLVING:  "Resolving",
  COMPLETED:  "Completed",
};

/** Common parts stocked on field trucks. Operator can also free-type in notes. */
const PARTS_OPTIONS = [
  "Bushing 500kV",
  "Oil Filter Cartridge",
  "Gasket Set",
  "Winding insulation tape",
  "Relay module",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvidenceFile {
  /** The real browser File object selected from disk. */
  file: File;
  /** Human-readable size string, e.g. "312 KB". */
  sizeLabel: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrder;
  onResolved: (res: ResolutionResponse) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ProofOfWorkModal: React.FC<Props> = ({
  isOpen,
  onClose,
  workOrder,
  onResolved,
}) => {
  // ── Stepper ────────────────────────────────────────────────────────────────
  const [step, setStep] = useState(0); // 0 | 1 | 2

  // ── Step 1: Field status ───────────────────────────────────────────────────
  const currentFieldIdx = FIELD_STATUSES.indexOf(
    (workOrder.field_status as FieldStatus) || "DISPATCHED",
  );
  const [fieldStatusIdx, setFieldStatusIdx] = useState(
    Math.max(currentFieldIdx, 0),
  );
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusSent, setStatusSent]         = useState(false);
  const [statusError, setStatusError]       = useState<string | null>(null);

  // ── Step 2: Evidence (real files only) ────────────────────────────────────
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [dragOver, setDragOver]           = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  // ── Step 3: Resolution form ────────────────────────────────────────────────
  const [actionTaken,    setActionTaken]    = useState("");
  const [partsReplaced,  setPartsReplaced]  = useState<string[]>([]);
  const [notes,          setNotes]          = useState("");
  const [signature,      setSignature]      = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [submitError,    setSubmitError]    = useState<string | null>(null);

  // ── File helpers ──────────────────────────────────────────────────────────

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setEvidenceFiles((prev) => {
      // Deduplicate by name — re-selecting the same file from disk should not
      // add a second entry.
      const existing = new Set(prev.map((e) => e.file.name));
      const fresh = incoming
        .filter((f) => !existing.has(f.name))
        .map((f) => ({ file: f, sizeLabel: sizeLabel(f.size) }));
      return [...prev, ...fresh];
    });
  }, []);

  const removeFile = (name: string) => {
    setEvidenceFiles((prev) => prev.filter((e) => e.file.name !== name));
  };

  const togglePart = (part: string) => {
    setPartsReplaced((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part],
    );
  };

  // ── Step 1 submit: sync field status to Jira ──────────────────────────────
  const handleAdvanceStatus = async () => {
    const newStatus = FIELD_STATUSES[fieldStatusIdx];
    setStatusUpdating(true);
    setStatusError(null);
    try {
      await API.updateWorkOrderStatus(workOrder.wo_id, newStatus);
      setStatusSent(true);
    } catch (e: any) {
      setStatusError(e.message || "Status sync failed — check your connection.");
    } finally {
      setStatusUpdating(false);
    }
  };

  // ── Step 3 submit: upload files then resolve ──────────────────────────────
  const handleResolve = async () => {
    if (!actionTaken.trim()) {
      setSubmitError("Please describe the action taken in the field.");
      return;
    }
    if (!signature.trim()) {
      setSubmitError("Technician signature is required to close the work order.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Upload real evidence files if any were attached
      if (evidenceFiles.length > 0) {
        await API.uploadProof(workOrder.wo_id, evidenceFiles.map((e) => e.file));
      }

      // 2. Close the work order: write maintenance history, release crew, re-score
      const proofAttachments = await Promise.all(evidenceFiles.map(async (e) => {
        const buffer = await e.file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        return {
          name:        e.file.name,
          type:        e.file.type || "application/octet-stream",
          size:        e.file.size,
          uploaded_at: new Date().toISOString(),
          url_or_data: `data:${e.file.type || "application/octet-stream"};base64,${base64}`,
        };
      }));

      const res = await API.resolveWorkOrder(workOrder.wo_id, {
        action_taken:          actionTaken,
        parts_replaced:        partsReplaced.length > 0 ? partsReplaced.join(", ") : undefined,
        notes:                 notes.trim() || undefined,
        technician_signature:  signature,
        field_status:          "COMPLETED",
        proof_attachments:     proofAttachments,
        result:                "COMPLETED",
      });

      onResolved(res);
    } catch (e: any) {
      setSubmitError(e.message || "Resolution failed — please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  const isCompleted = workOrder.field_status === "COMPLETED";

  if (isCompleted) {
    return (
      <Modal
        open={isOpen}
        onRequestClose={onClose}
        modalHeading="Completed Work Order Evidence"
        modalLabel={`${workOrder.wo_id} · ${workOrder.asset_id}`}
        primaryButtonText="Close"
        onRequestSubmit={onClose}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-line">
            <span className="text-label font-semibold text-ink">Final status:</span>
            <Tag type="green" size="sm">COMPLETED</Tag>
            {workOrder.jira_key && (
              <a
                href={workOrder.jira_url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-micro text-brand-ink hover:underline ml-auto"
                title={`Open ${workOrder.jira_key} in enterprise tracker`}
              >
                🎫 {workOrder.jira_key}
              </a>
            )}
          </div>
          <div className="mt-2 text-label text-ink-2">
            The following evidence was submitted by the field crew upon resolution:
          </div>
          {workOrder.proof_attachments && workOrder.proof_attachments.length > 0 ? (
            <div className="border border-line rounded-lg overflow-hidden mt-2">
              {workOrder.proof_attachments.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2.5 border-b border-line last:border-b-0 bg-panel"
                >
                  <Attachment size={16} className="text-brand-ink shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-label font-semibold text-ink truncate">{file.name}</span>
                    <span className="font-mono text-micro text-ink-3">
                      {sizeLabel(file.size)} &middot; {new Date(file.uploaded_at).toLocaleString()}
                    </span>
                  </div>
                  <Button kind="ghost" size="sm" renderIcon={Download} iconDescription="Download">
                    Download
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 border border-line bg-sunken rounded text-center text-ink-3 text-micro mt-2">
              No evidence files were attached to this work order.
            </div>
          )}
          {workOrder.technician_signature && (
            <div className="mt-4 p-3 bg-[#f0f4f8] rounded border border-line">
              <span className="text-micro font-bold text-ink-2 uppercase tracking-wider block mb-1">Signed Off By</span>
              <span className="font-mono text-brand-ink font-semibold">{workOrder.technician_signature}</span>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={isOpen}
      onRequestClose={onClose}
      modalHeading="Field Proof-of-Work & Resolution"
      modalLabel={`${workOrder.wo_id} · ${workOrder.asset_id}`}
      primaryButtonText={
        step === 0
          ? "Sync Status & Continue →"
          : step === 1
          ? "Continue to Resolution →"
          : "Resolve & Re-score Grid"
      }
      secondaryButtonText={step > 0 ? "← Back" : "Cancel"}
      primaryButtonDisabled={
        (step === 0 && statusUpdating) ||
        (step === 2 && submitting)
      }
      onRequestSubmit={
        step === 0
          ? () => { handleAdvanceStatus(); setStep(1); }
          : step === 1
          ? () => setStep(2)
          : handleResolve
      }
      onSecondarySubmit={step > 0 ? () => setStep((s) => s - 1) : onClose}
      size="lg"
    >
      {/* ── Progress stepper ── */}
      <div className="mb-5">
        <ProgressIndicator currentIndex={step} spaceEqually>
          <ProgressStep
            label="Field Status"
            description="Crew position in the workflow"
          />
          <ProgressStep
            label="Evidence"
            description="Attach proof files from disk"
          />
          <ProgressStep
            label="Resolution"
            description="Sign off and close the work order"
          />
        </ProgressIndicator>
      </div>

      {/* ── Step 0: Field Status ── */}
      {step === 0 && (
        <div className="flex flex-col gap-4">
          {/* Work order context */}
          <div className="flex items-center gap-2 pb-2 border-b border-line">
            <span className="text-label font-semibold text-ink">Current status:</span>
            <Tag type="blue" size="sm">
              {workOrder.field_status || "DISPATCHED"}
            </Tag>
            {workOrder.jira_key && (
              <a
                href={workOrder.jira_url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-micro text-brand-ink hover:underline ml-auto"
                title={`Open ${workOrder.jira_key} in enterprise tracker`}
              >
                🎫 {workOrder.jira_key}
              </a>
            )}
          </div>

          <p className="text-label text-ink-2">
            Select the crew's current position. Clicking "Sync Status" writes the
            transition to the work order and updates the linked enterprise ticket.
          </p>

          {/* Status rail */}
          <div className="flex overflow-x-auto rounded-lg border border-line">
            {FIELD_STATUSES.map((s, i) => (
              <button
                key={s}
                onClick={() => setFieldStatusIdx(i)}
                className={[
                  "flex-1 py-2.5 px-2 text-micro font-semibold transition-colors whitespace-nowrap",
                  "border-r border-line last:border-r-0",
                  fieldStatusIdx === i
                    ? "bg-brand-tint text-brand-ink"
                    : i < fieldStatusIdx
                    ? "bg-green-50 text-green-700"
                    : "bg-canvas text-ink-3 hover:bg-sunken",
                ].join(" ")}
              >
                {i < fieldStatusIdx && (
                  <CheckmarkFilled size={11} className="inline mr-1 text-green-600" />
                )}
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {statusSent && (
            <div className="flex items-center gap-2 text-green-700 text-label">
              <CheckmarkFilled size={16} />
              <span>
                Status set to <strong>{FIELD_STATUSES[fieldStatusIdx]}</strong>
                {workOrder.jira_key ? ` — synced to ${workOrder.jira_key}` : ""}.
              </span>
            </div>
          )}
          {statusError && (
            <div className="flex items-center gap-2 text-red-700 text-label">
              <WarningFilled size={16} />
              <span>{statusError}</span>
            </div>
          )}
          {statusUpdating && <InlineLoading description="Syncing status…" />}
        </div>
      )}

      {/* ── Step 1: Evidence ── */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <p className="text-label text-ink-2">
            Attach evidence files collected on site: thermal scans, DGA reports,
            inspection photos, test logs. Only files you select from disk are
            uploaded — nothing is generated or fabricated.
          </p>

          {/* Drag-and-drop zone */}
          <div
            className={[
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              dragOver
                ? "border-brand bg-brand-tint"
                : "border-line bg-canvas hover:border-brand-ink",
            ].join(" ")}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Drop evidence files here or click to browse"
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          >
            <Upload size={28} className="mx-auto mb-2 text-brand-ink" />
            <div className="text-label font-semibold text-ink">
              Drop files here or{" "}
              <span className="text-brand-ink underline">browse</span>
            </div>
            <div className="text-micro text-ink-3 mt-1">
              PDF, PNG, JPG, CSV — any files relevant to this work order
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
            aria-hidden="true"
          />

          {/* File list */}
          {evidenceFiles.length > 0 && (
            <div className="border border-line rounded-lg overflow-hidden">
              {evidenceFiles.map((item) => (
                <div
                  key={item.file.name}
                  className="flex items-center gap-2 px-3 py-2.5 border-b border-line last:border-b-0 bg-panel"
                >
                  <Attachment size={14} className="text-brand-ink shrink-0" />
                  <span className="text-label text-ink flex-1 truncate min-w-0">
                    {item.file.name}
                  </span>
                  <span className="font-mono text-micro text-ink-3 shrink-0">
                    {item.sizeLabel}
                  </span>
                  <button
                    onClick={() => removeFile(item.file.name)}
                    className="shrink-0 p-1 text-ink-3 hover:text-red-600 transition-colors rounded"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <TrashCan size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {evidenceFiles.length === 0 && (
            <p className="text-micro text-ink-3 text-center py-1">
              No files attached. You may proceed without evidence — it will be
              recorded that none was provided.
            </p>
          )}
        </div>
      )}

      {/* ── Step 2: Resolution form ── */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <TextArea
            id="pow-action-taken"
            labelText="Action taken *"
            placeholder="Describe exactly what was done in the field…"
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
            rows={3}
            required
          />

          <div>
            <div className="text-micro text-ink-3 uppercase tracking-wider mb-2">
              Parts replaced — select all that apply
            </div>
            <div className="flex flex-wrap gap-2">
              {PARTS_OPTIONS.map((part) => (
                <button
                  key={part}
                  type="button"
                  onClick={() => togglePart(part)}
                  className={[
                    "text-micro px-2.5 py-1 rounded border transition-colors",
                    partsReplaced.includes(part)
                      ? "border-brand bg-brand-tint text-brand-ink font-semibold"
                      : "border-line bg-canvas text-ink hover:border-brand-ink",
                  ].join(" ")}
                >
                  {partsReplaced.includes(part) && "✓ "}
                  {part}
                </button>
              ))}
            </div>
            <p className="text-micro text-ink-3 mt-1.5">
              Not listed? Add details in the notes field below.
            </p>
          </div>

          <TextArea
            id="pow-notes"
            labelText="Additional notes"
            placeholder="Hazards observed, follow-up work required, deviations from standard procedure…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />

          <TextInput
            id="pow-signature"
            labelText="Technician signature *"
            placeholder="Full name of attending technician"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            required
          />

          {/* Evidence summary */}
          {evidenceFiles.length > 0 ? (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded p-2 text-label">
              <CheckmarkFilled size={16} />
              <span>
                {evidenceFiles.length} file{evidenceFiles.length > 1 ? "s" : ""} will be uploaded:{" "}
                {evidenceFiles.map((e) => e.file.name).join(", ")}
              </span>
            </div>
          ) : (
            <div className="text-micro text-ink-3 bg-sunken border border-line rounded p-2">
              No evidence files attached. Proceeding without evidence will be
              recorded in the audit log.
            </div>
          )}

          {submitError && (
            <div className="flex items-center gap-2 text-red-700 text-label bg-red-50 border border-red-200 rounded p-2">
              <WarningFilled size={16} />
              <span>{submitError}</span>
            </div>
          )}

          {submitting && (
            <InlineLoading description="Uploading evidence & closing work order…" />
          )}
        </div>
      )}
    </Modal>
  );
};
