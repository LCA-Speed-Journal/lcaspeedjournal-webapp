import Link from "next/link";
import { PageBackground } from "@/app/components/PageBackground";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
      <PageBackground />

      <main className="relative z-10 w-full max-w-xl text-center">
        {/* Hero card */}
        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-8 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-10" style={{ boxShadow: "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)" }}>
          <div className="mb-6 inline-block h-1 w-16 rounded-full bg-accent" />
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            LCA Speed Journal
          </h1>
          <p className="mt-3 text-lg text-foreground-muted">
            Track & field and strength data — live leaderboards, athlete management
          </p>

          {/* Primary CTA */}
          <div className="mt-8">
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 font-semibold text-background shadow-[0_8px_30px_-6px_rgba(251,191,36,0.35)] transition-all hover:bg-accent-hover hover:shadow-[0_10px_40px_-8px_rgba(251,191,36,0.4)] hover:scale-[1.02] active:scale-[0.98]"
            >
              <span aria-hidden>→</span>
              Leaderboard
            </Link>
          </div>

          {/* Secondary links: two rows */}
          <div className="mt-10 space-y-6 border-t border-border pt-8">
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                View
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/historical"
                  className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
                >
                  Historical
                </Link>
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
                Manage
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/athletes"
                  className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
                >
                  Athletes
                </Link>
                <Link
                  href="/data-entry"
                  className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
                >
                  Data entry
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
                >
                  Coach login
                </Link>
              </div>
            </div>
          </div>

          <p className="mt-6">
            <Link
              href="/api/athletes"
              className="text-sm text-foreground-muted underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-accent/50"
            >
              API: Athletes
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
