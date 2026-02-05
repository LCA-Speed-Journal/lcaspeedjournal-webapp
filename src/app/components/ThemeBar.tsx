"use client";

import Link from "next/link";
import { ThemeToggle } from "@/app/components/ThemeToggle";

export function ThemeBar({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="fixed top-0 right-0 z-[100] flex items-center gap-3 p-3">
        <ThemeToggle />
        <Link
          href="/"
          className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 hover:bg-surface"
        >
          Home
        </Link>
      </div>
      <div className="min-h-screen">{children}</div>
    </>
  );
}
