"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type DataEntryLayoutProps = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
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
    <>
      <header className="mb-6 flex items-center justify-between md:mb-8">
        <div className="flex items-center gap-3">
          {!isDesktop && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface"
              aria-label="Open session menu"
            >
              Session
            </button>
          )}
          <div>
            <div className="mb-2 inline-block h-1 w-16 rounded-full bg-accent md:mb-4" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl md:text-4xl">
              Data entry
            </h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/athletes"
            className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
          >
            Athletes
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
          >
            Home
          </Link>
        </div>
      </header>

      {!isDesktop && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          aria-hidden
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="relative flex flex-col gap-6 md:flex-row">
        <aside
          className={`
            relative z-50 flex-shrink-0 overflow-y-auto
            md:relative md:z-auto md:max-h-none
            ${showSidebar && !isDesktop
              ? "fixed inset-y-0 left-0 w-[min(100vw,320px)] border-r border-border bg-surface/95 p-4 shadow-xl"
              : ""
            }
            ${isDesktop ? "w-72 max-w-[320px] pr-6" : ""}
          `}
        >
          {!isDesktop && showSidebar && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="mb-2 rounded border border-border px-2 py-1 text-sm text-foreground hover:bg-surface-elevated"
              aria-label="Close session menu"
            >
              Close
            </button>
          )}
          {showSidebar ? sidebar : null}
        </aside>

        <main className="min-w-0 flex-1">{main}</main>
      </div>
    </>
  );
}
