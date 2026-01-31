import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import metricsData from "@/lib/metrics.json";
import { PageBackground } from "@/app/components/PageBackground";
import { SessionForm } from "./SessionForm";
import { EntryForm } from "./EntryForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PHASES = [
  "Preseason",
  "Preparation",
  "Competition",
  "Championship",
] as const;

/** Metric key, label, and structure for session setup */
type MetricMeta = {
  display_name: string;
  input_structure: string;
  default_splits: (number | string)[];
};
const metricOptions = Object.entries(metricsData as Record<string, MetricMeta>).map(
  ([key, m]) => ({
    key,
    label: m.display_name,
    input_structure: m.input_structure,
    default_splits: m.default_splits ?? [],
  })
);

function DataEntryError({ message }: { message: string }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-8 md:px-8 md:py-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8" style={{ boxShadow: "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)" }}
          <h1 className="text-xl font-bold text-danger">Data entry error</h1>
          <p className="mt-2 font-mono text-sm text-foreground">{message}</p>
          <p className="mt-4 text-sm text-foreground-muted">
            If this is a deployment, ensure NEXTAUTH_SECRET, NEXTAUTH_URL, and POSTGRES_URL are set in Vercel → Project → Settings → Environment Variables. NEXTAUTH_URL must be your Vercel app URL (e.g. https://your-app.vercel.app).
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-accent hover:text-accent-hover">Home</Link>
        </div>
      </div>
    </div>
  );
}

export default async function DataEntryPage() {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[data-entry] server error:", err);
    return <DataEntryError message={message} />;
  }

  if (!session) {
    redirect("/login?callbackUrl=/data-entry");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-8 md:px-8 md:py-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8" style={{ boxShadow: "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)" }}
          <header className="mb-8 flex items-center justify-between">
            <div>
              <div className="mb-4 inline-block h-1 w-16 rounded-full bg-accent" />
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Data entry
              </h1>
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

          <section className="mb-8">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
              New session
            </p>
            <SessionForm
              phases={PHASES}
              metricOptions={metricOptions}
            />
          </section>

          <section className="mb-8">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
              Add entry
            </p>
            <EntryForm />
          </section>

          <section>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
              Recent sessions
            </p>
            <Suspense fallback={<p className="text-sm text-foreground-muted">Loading recent sessions…</p>}>
              <RecentSessionsList />
            </Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}

const SESSIONS_QUERY_MS = 8000;

async function RecentSessionsList() {
  let sessions: { id: string; session_date: string; phase: string; phase_week: number }[] = [];
  let timedOut = false;
  try {
    const queryPromise = sql`
      SELECT id, session_date, phase, phase_week
      FROM sessions
      ORDER BY session_date DESC, created_at DESC
      LIMIT 20
    `;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), SESSIONS_QUERY_MS)
    );
    const { rows } = await Promise.race([queryPromise, timeoutPromise]);
    sessions = rows as typeof sessions;
  } catch (err) {
    if ((err as Error)?.message === "timeout") timedOut = true;
    // ignore other errors (e.g. no table yet)
  }

  if (timedOut) {
    return (
      <p className="text-sm text-gold">
        Could not load recent sessions (connection slow or timed out). You can still create a session above.
      </p>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No sessions yet. Create one above.
      </p>
    );
  }

  const formatDate = (d: string | Date) =>
    d instanceof Date ? d.toISOString().slice(0, 10) : String(d);

  return (
    <ul className="space-y-2">
      {sessions.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2 text-sm text-foreground"
        >
          <span>
            {formatDate(s.session_date as string | Date)} — {s.phase} week {s.phase_week}
          </span>
          <span className="font-mono text-foreground-muted">{s.id.slice(0, 8)}…</span>
        </li>
      ))}
    </ul>
  );
}
