"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_REFRESH_MS, stillRefreshing } from "@/lib/quiet-refresh";

const updatedFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function useQuietRefresh(signature: string | null) {
  const [polling, setPolling] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const changedAt = useRef(0);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (signature == null) return;
    const now = Date.now();
    setUpdatedAt(now);
    if (previous.current !== signature) {
      previous.current = signature;
      changedAt.current = now;
      setPolling(true);
    }
  }, [signature]);

  useEffect(() => {
    if (!polling || signature == null) return;
    const timer = window.setInterval(() => {
      if (!stillRefreshing(changedAt.current, Date.now())) setPolling(false);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [polling, signature]);

  const resume = useCallback(() => {
    changedAt.current = Date.now();
    setPolling(true);
  }, []);

  return { polling, updatedAt, resume, refreshInterval: polling ? LIVE_REFRESH_MS : 0 };
}

export function FreshnessStamp({
  updatedAt,
  polling,
  onRefresh,
}: {
  updatedAt: number | null;
  polling: boolean;
  onRefresh: () => void;
}) {
  const label = updatedAt == null ? "—" : updatedFormatter.format(updatedAt);
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-1 text-xs text-foreground-muted shadow-sm">
      <span>
        {polling ? "Live" : "Updates paused"} · Last updated {label}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        className="rounded-full border border-border px-2 py-0.5 font-medium text-foreground hover:border-accent/50"
      >
        Refresh
      </button>
    </div>
  );
}
