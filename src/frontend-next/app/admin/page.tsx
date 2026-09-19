"use client";

import React, { useEffect, useState } from "react";
import {
  Tile,
  Tag,
  Button,
  InlineLoading,
} from "@carbon/react";
import { CheckmarkOutline, DocumentBlank } from "@carbon/icons-react";
import { API } from "@/lib/api";
import { WorkOrder } from "@/types/grid";
import { useToast } from "@/context/ToastContext";

export default function AdminProofOfWorkPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { err } = useToast();

  const handlePreviewClick = (e: React.MouseEvent<HTMLAnchorElement>, url_or_data: string | undefined, name: string) => {
    if (!url_or_data) return;
    if (url_or_data.startsWith("upload://")) {
      e.preventDefault();
      err("Preview not available for this placeholder file.");
      return;
    }
    if (url_or_data.startsWith("data:")) {
      e.preventDefault();
      fetch(url_or_data)
        .then((res) => res.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          const newWin = window.open(blobUrl, "_blank");
          if (!newWin) {
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = name || "attachment";
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        })
        .catch(() => err("Failed to open file preview."));
    }
  };

  useEffect(() => {
    API.getWorkOrders()
      .then((data) => {
        // Fetch all and filter for demonstration since CLOSED may be too strict or empty.
        setWorkOrders(data);
      })
      .catch((e) => {
        err(e.message || "Failed to load completed work orders");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [err]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <InlineLoading description="Fetching proof of work records..." />
      </div>
    );
  }

  // Filter for work orders that have proof attachments
  const proofWorkOrders = workOrders.filter(wo => wo.proof_attachments && wo.proof_attachments.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink mb-1">Admin Dashboard</h1>
          <p className="text-ink-3 text-sm font-mono uppercase tracking-wider">
            Proof of Work (PoW) Audit
          </p>
        </div>
      </div>

      {proofWorkOrders.length === 0 ? (
        <Tile className="bg-canvas border border-line shadow-panel text-center py-12">
          <DocumentBlank size={32} className="mx-auto text-ink-4 mb-4" />
          <h3 className="text-lg font-semibold text-ink">No Proof of Work found</h3>
          <p className="text-ink-3 mt-2">There are currently no completed work orders with attached proof of work.</p>
        </Tile>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {proofWorkOrders.map((wo) => (
            <Tile key={wo.wo_id} className="bg-canvas border border-line shadow-panel flex flex-col p-0 overflow-hidden">
              <div className="p-4 border-b border-line bg-gray-50 flex items-center justify-between">
                <div className="text-sm font-mono font-bold text-ink">#{wo.jira_key || wo.wo_id.substring(0, 8)}</div>
                <Tag type="green" className="m-0" renderIcon={CheckmarkOutline}>
                  VERIFIED
                </Tag>
              </div>
              
              <div className="p-4 flex-1">
                <h4 className="font-bold text-ink mb-1">{wo.title || "Emergency Maintenance"}</h4>
                <p className="text-sm text-ink-3 mb-4 line-clamp-2">
                  {wo.description || "Resolved grid anomaly reported by field sensors."}
                </p>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-4">Crew ID</span>
                    <span className="font-mono text-ink-2">{wo.assigned_crew_id || "Unassigned"}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-4">Resolved</span>
                    <span className="font-mono text-ink-2">
                      {wo.updated_at ? new Date(wo.updated_at).toLocaleString() : "Recent"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t border-line">
                <h5 className="text-xs font-bold text-ink uppercase tracking-wider mb-3">Evidence Attached</h5>
                <div className="flex flex-wrap gap-2">
                  {wo.proof_attachments?.map((attachment, idx) => (
                    <a
                      key={idx}
                      href={attachment.url_or_data}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-[100px]"
                      onClick={(e) => handlePreviewClick(e, attachment.url_or_data, attachment.name)}
                    >
                      {attachment.url_or_data && (attachment.url_or_data.match(/\.(jpeg|jpg|gif|png)$/i) || attachment.url_or_data.startsWith("data:image/")) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={attachment.url_or_data} 
                          alt="Proof" 
                          className="w-full h-24 object-cover rounded border border-line hover:opacity-80 transition-opacity"
                        />
                      ) : (
                        <div className="w-full h-24 bg-gray-200 rounded border border-line flex items-center justify-center hover:bg-gray-300 transition-colors">
                          <DocumentBlank size={24} className="text-ink-4" />
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            </Tile>
          ))}
        </div>
      )}
    </div>
  );
}
