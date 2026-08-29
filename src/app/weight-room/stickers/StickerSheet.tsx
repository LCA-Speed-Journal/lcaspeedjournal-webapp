"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import useSWR from "swr";
import { PageBackground } from "@/app/components/PageBackground";
import { HUGO_GROUP_META, type HugoGroup } from "@/lib/weight-room/constants";
import type { Athlete } from "@/types";
import type { AthleteSticker } from "@/types/weight-room";

const fetcher = (url: string) =>
  fetch(url).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(r.statusText))
  );

type StickerRow = AthleteSticker & {
  first_name: string;
  last_name: string;
  hugo_group: string | null;
};

function groupLabel(group: string | null | undefined): string {
  if (!group) return "";
  if (group in HUGO_GROUP_META) {
    return HUGO_GROUP_META[group as HugoGroup].label;
  }
  return group;
}

export function StickerSheet() {
  const {
    data: stickersRes,
    error: stickersError,
    isLoading: stickersLoading,
    mutate: mutateStickers,
  } = useSWR<{ data: StickerRow[] }>("/api/weight-room/stickers", fetcher);
  const {
    data: athletesRes,
    error: athletesError,
    isLoading: athletesLoading,
  } = useSWR<{ data: Athlete[] }>("/api/athletes?active=true", fetcher);

  const stickers = stickersRes?.data ?? [];
  const athletes = athletesRes?.data ?? [];

  const issuedIds = useMemo(
    () => new Set(stickers.map((s) => s.athlete_id)),
    [stickers]
  );
  const issuable = useMemo(
    () =>
      athletes.filter(
        (a) => Boolean(a.hugo_group) && !issuedIds.has(a.id)
      ),
    [athletes, issuedIds]
  );

  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [issueError, setIssueError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function generate() {
      const next: Record<string, string> = {};
      await Promise.all(
        stickers.map(async (s) => {
          next[s.id] = await QRCode.toDataURL(s.payload, {
            margin: 1,
            width: 256,
            errorCorrectionLevel: "M",
            color: { dark: "#000000", light: "#ffffff" },
          });
        })
      );
      if (!cancelled) setQrUrls(next);
    }
    void generate();
    return () => {
      cancelled = true;
    };
  }, [stickers]);

  async function issueSticker(athleteId: string) {
    setIssueError("");
    setIssuingId(athleteId);
    try {
      const res = await fetch("/api/weight-room/stickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: athleteId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setIssueError(json.error ?? "Failed to issue sticker");
        return;
      }
      await mutateStickers();
    } catch {
      setIssueError("Network error — try again");
    } finally {
      setIssuingId(null);
    }
  }

  const loadError = stickersError
    ? "Failed to load stickers"
    : athletesError
      ? "Failed to load athletes"
      : "";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-12 print:overflow-visible print:bg-white print:px-4 print:py-4">
      <div className="print:hidden">
        <PageBackground />
      </div>
      <main className="relative z-10 mx-auto max-w-5xl">
        <div className="print:hidden">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
            Weight room
          </p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Stickers</h1>
          <p className="mt-3 max-w-2xl text-foreground-muted">
            Issue a reusable QR sticker for each athlete in a Hugo group, then
            print the sheet. Each athlete gets one active sticker.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/weight-room"
              className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50"
            >
              Back to hub
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={stickers.length === 0}
              className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 disabled:opacity-50"
            >
              Print sheet
            </button>
          </div>

          {loadError ? (
            <p className="mt-4 text-sm text-danger">{loadError}</p>
          ) : null}
          {issueError ? (
            <p className="mt-4 text-sm text-danger">{issueError}</p>
          ) : null}

          <section className="mt-8">
            <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted">
              Issue sticker
            </h2>
            {stickersLoading || athletesLoading ? (
              <p className="mt-3 text-sm text-foreground-muted">Loading…</p>
            ) : issuable.length === 0 ? (
              <p className="mt-3 text-sm text-foreground-muted">
                No active athletes with a Hugo group are waiting for a sticker.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {issuable.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {a.last_name}, {a.first_name}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {groupLabel(a.hugo_group)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void issueSticker(a.id)}
                      disabled={issuingId === a.id}
                      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
                    >
                      {issuingId === a.id ? "Issuing…" : "Issue sticker"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="mt-10 print:mt-0">
          <h2 className="text-sm font-medium uppercase tracking-wider text-foreground-muted print:hidden">
            Print sheet
          </h2>
          {stickers.length === 0 ? (
            <p className="mt-3 text-sm text-foreground-muted print:hidden">
              No active stickers yet.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 print:mt-0 print:grid-cols-4 print:gap-2">
              {stickers.map((s) => (
                <div
                  key={s.id}
                  className="break-inside-avoid flex flex-col items-center bg-white p-3 text-black"
                >
                  {qrUrls[s.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrUrls[s.id]}
                      alt={`QR sticker for ${s.last_name}, ${s.first_name}`}
                      className="h-32 w-32"
                    />
                  ) : (
                    <div className="h-32 w-32 bg-neutral-200 print:bg-white" />
                  )}
                  <p className="mt-2 text-center text-sm font-medium text-black">
                    {s.last_name}, {s.first_name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
