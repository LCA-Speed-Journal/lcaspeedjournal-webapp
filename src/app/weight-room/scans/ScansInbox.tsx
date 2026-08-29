"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import { SCAN_STATUSES, type ScanStatus } from "@/lib/weight-room/constants";
import type { ScanListRow } from "@/types/weight-room";

const fetcher = (url: string) =>
  fetch(url).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(r.statusText))
  );

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function athleteLabel(scan: ScanListRow): string {
  const first = scan.first_name?.trim() ?? "";
  const last = scan.last_name?.trim() ?? "";
  const name = `${first} ${last}`.trim();
  return name || "Unmatched";
}

function uploadedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function errorText(json: { error?: string }, fallback: string): string {
  return json.error ?? fallback;
}

export function ScansInbox() {
  const { data, error, isLoading, mutate } = useSWR<{ data: ScanListRow[] }>(
    "/api/weight-room/scans",
    fetcher
  );
  const scans = data?.data ?? [];
  const [statusFilter, setStatusFilter] = useState<"all" | ScanStatus>("all");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadedId, setUploadedId] = useState("");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return scans;
    return scans.filter((s) => s.status === statusFilter);
  }, [scans, statusFilter]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploadError("");
    setUploadedId("");
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("File must be JPEG, PNG, or WebP, max 4 MB");
      return;
    }
    setUploadBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/weight-room/scans", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as {
        error?: string;
        data?: { id?: string };
      };
      if (!res.ok) {
        setUploadError(errorText(json, "Upload failed"));
        return;
      }
      if (json.data?.id) {
        setUploadedId(json.data.id);
      }
      await mutate();
    } catch {
      setUploadError("Network error — try again");
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-12">
      <PageBackground />
      <main className="relative z-10 mx-auto max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Weight room
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Scans</h1>
        <p className="mt-3 max-w-2xl text-foreground-muted">
          Upload a photo of a filled card, then review unmatched or flagged
          scans before confirming the log.
        </p>

        <div className="mt-4">
          <Link
            href="/weight-room"
            className="inline-block rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Back to hub
          </Link>
        </div>

        <section className="mt-8 rounded-xl border border-border bg-surface-elevated p-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
            Upload scan
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            JPEG, PNG, or WebP only. Max 4 MB. PDFs are not accepted — export a
            page as an image in the scanner driver first.
          </p>
          <label className="mt-3 block text-sm text-foreground">
            Card photo
            <input
              type="file"
              accept={ACCEPT}
              disabled={uploadBusy}
              className="mt-1 block w-full min-w-0 text-sm text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void onFile(file);
              }}
            />
          </label>
          {uploadBusy ? (
            <p className="mt-2 text-sm text-foreground-muted">Uploading…</p>
          ) : null}
          {uploadError ? (
            <p className="mt-2 text-sm text-danger">{uploadError}</p>
          ) : null}
          {uploadedId ? (
            <p className="mt-2 text-sm text-foreground">
              Uploaded.{" "}
              <Link
                href={`/weight-room/scans/${uploadedId}`}
                className="font-medium text-accent hover:underline"
              >
                Open review
              </Link>
            </p>
          ) : null}
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
              Inbox
            </h2>
            <label className="text-sm text-foreground">
              Status
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "all" | ScanStatus)
                }
                className="mt-1 block rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-foreground"
              >
                <option value="all">All</option>
                {SCAN_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isLoading ? (
            <p className="mt-3 text-sm text-foreground-muted">Loading…</p>
          ) : error ? (
            <p className="mt-3 text-sm text-danger">Failed to load scans</p>
          ) : filtered.length === 0 ? (
            <p className="mt-3 text-sm text-foreground-muted">
              No scans in this filter.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {filtered.map((scan) => (
                <li key={scan.id}>
                  <Link
                    href={`/weight-room/scans/${scan.id}`}
                    className="block rounded-xl border border-border bg-surface-elevated px-4 py-3 hover:border-accent/50"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {athleteLabel(scan)}
                    </p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {statusLabel(scan.status)}
                      {" · "}
                      {scan.template_title || "No template"}
                      {" · "}
                      {uploadedLabel(scan.uploaded_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
