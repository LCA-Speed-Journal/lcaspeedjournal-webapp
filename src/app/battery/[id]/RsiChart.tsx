"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RsqPlot, type RsqDot } from "./RsqPlot";

export function RsiChart({
  label,
  athletes,
  onDetailChange,
}: {
  label: string;
  athletes: RsqDot[];
  onDetailChange: (open: boolean) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState<"preview" | "detail" | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onDetailChange(open === "detail");
  }, [open, onDetailChange]);

  useEffect(() => {
    if (open !== "detail") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    return () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  function showPreview() {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 288;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setAnchor({ top: rect.bottom + 4, left });
    }
    setOpen((current) => (current === "detail" ? current : "preview"));
  }

  function scheduleHide() {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setOpen((current) => (current === "preview" ? null : current));
    }, 160);
  }

  const preview =
    mounted && open === "preview" && anchor
      ? createPortal(
          <div
            data-rsq-preview
            className="fixed z-40"
            style={{ top: anchor.top, left: anchor.left }}
            onMouseEnter={showPreview}
            onMouseLeave={scheduleHide}
          >
            <RsqPlot athletes={athletes} />
          </div>,
          document.body
        )
      : null;

  const detail =
    mounted && open === "detail"
      ? createPortal(
          <div
            data-rsq-detail
            role="dialog"
            aria-modal="true"
            aria-label="RSQ chart"
            className="fixed inset-0 z-[110] flex flex-col bg-background px-4 py-4 text-foreground sm:px-8 sm:py-6"
          >
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <p className="text-sm text-foreground-muted">Hover a point for the athlete, RSI, and rank.</p>
              <button
                type="button"
                className="rounded-full border border-border bg-surface px-3 py-1 text-sm font-semibold uppercase tracking-wider hover:border-accent/50"
                onClick={() => setOpen(null)}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <RsqPlot athletes={athletes} variant="full" />
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="w-full truncate px-0 py-1 text-center underline decoration-dotted underline-offset-2 hover:text-accent md:px-0.5"
        aria-haspopup="dialog"
        aria-expanded={open === "detail"}
        title="Hover for the RSQ preview. Click to open it."
        onMouseEnter={showPreview}
        onMouseLeave={scheduleHide}
        onFocus={showPreview}
        onBlur={scheduleHide}
        onClick={() => setOpen("detail")}
      >
        {label}
      </button>
      {preview}
      {detail}
    </>
  );
}
