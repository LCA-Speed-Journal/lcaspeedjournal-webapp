import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import metricsData from "@/lib/metrics.json";
import { SessionForm } from "./SessionForm";
import { AthleteForm } from "./AthleteForm";
import { EntryForm } from "./EntryForm";
import Link from "next/link";

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
    <div className="min-h-screen p-4 md:p-8">
      <h1 className="text-xl font-bold text-red-600 dark:text-red-400">Data entry error</h1>
      <p className="mt-2 font-mono text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        If this is a deployment, ensure NEXTAUTH_SECRET, NEXTAUTH_URL, and POSTGRES_URL are set in Vercel → Project → Settings → Environment Variables. NEXTAUTH_URL must be your Vercel app URL (e.g. https://your-app.vercel.app).
      </p>
      <Link href="/" className="mt-4 inline-block text-sm underline">Home</Link>
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
    <div className="min-h-screen p-4 md:p-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Data entry</h1>
        <Link
          href="/"
          className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Home
        </Link>
      </header>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">New session</h2>
        <SessionForm
          phases={PHASES}
          metricOptions={metricOptions}
        />
      </section>

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Add athlete</h2>
          <AthleteForm />
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Add entry</h2>
          <EntryForm />
        </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Recent sessions</h2>
        <Suspense fallback={<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading recent sessions…</p>}>
          <RecentSessionsList />
        </Suspense>
      </section>
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
      <p className="text-sm text-amber-600 dark:text-amber-400">
        Could not load recent sessions (connection slow or timed out). You can still create a session above.
      </p>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
          className="flex items-center justify-between rounded border px-3 py-2 text-sm"
        >
          <span>
            {formatDate(s.session_date as string | Date)} — {s.phase} week {s.phase_week}
          </span>
          <span className="font-mono text-zinc-500">{s.id.slice(0, 8)}…</span>
        </li>
      ))}
    </ul>
  );
}
