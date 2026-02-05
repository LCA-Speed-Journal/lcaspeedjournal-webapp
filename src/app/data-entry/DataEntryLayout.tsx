"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type DataEntryLayoutProps = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
};

const cardClass =
  "rounded-2xl border-2 border-border/80 bg-surface/90 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8";
const cardStyle = {
  boxShadow:
    "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)",
};

export function DataEntryLayout({ sidebar, main }: DataEntryLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = () => setIsDesktop(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const showSidebar = isDesktop || sidebarOpen;

  return (
    <div className="relative z-10 flex min-h-screen">
      {/* Sidebar — same surface/border as Athletes page */}
      <div
        className={
          !showSidebar
            ? "hidden"
            : showSidebar && !isDesktop
              ? "fixed inset-y-0 left-0 z-50 w-[min(100vw,320px)] overflow-y-auto border-r border-border/80 bg-surface/90 p-6 shadow-xl backdrop-blur-sm"
              : "w-full flex-shrink-0 overflow-y-auto border-r border-border/80 bg-surface/90 p-6 backdrop-blur-sm md:w-80 lg:w-96"
        }
      >
        {!isDesktop && showSidebar && (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="mb-4 rounded border border-border px-2 py-1 text-sm text-foreground hover:bg-surface-elevated"
            aria-label="Close session menu"
          >
            Close
          </button>
        )}
        <header className="mb-6 flex flex-col gap-4">
          <div>
            <div className="mb-2 inline-block h-1 w-12 rounded-full bg-accent" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Data entry
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/athletes"
              className="rounded-xl border border-border bg-surface-elevated px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
            >
              Athletes
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-border bg-surface-elevated px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
            >
              Home
            </Link>
          </div>
        </header>
        {sidebar}
      </div>

      {/* Main content: background shows through; center card matches Athletes */}
      <div className="flex-1 overflow-y-auto px-6 py-8 md:px-8 md:py-10">
        {!isDesktop && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="mb-4 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface"
            aria-label="Open session menu"
          >
            Session
          </button>
        )}
        <div className="mx-auto max-w-4xl">
          <div className={`p-6 ${cardClass}`} style={cardStyle}>
            {main}
          </div>
        </div>
      </div>

      {!isDesktop && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          aria-hidden
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
