import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PageBackground } from "@/app/components/PageBackground";

export const dynamic = "force-dynamic";

export default async function WeightRoomHubPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/weight-room");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-12">
      <PageBackground />
      <main className="relative z-10 mx-auto max-w-xl">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Manage
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Weight room</h1>
        <p className="mt-3 text-foreground-muted">
          Hugo card printing, scan intake, and reports. Printable sheet layout is
          the first checkpoint — review it before we lock scan processing.
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          Scan upload accepts JPEG, PNG, or WebP, max 4 MB (Vercel request
          limit). Export PDF pages in the scanner driver; resize large phone
          photos in the camera or scanner.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/weight-room/cards"
            className="rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Cards / templates
          </Link>
          <Link
            href="/weight-room/preview"
            className="rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Card preview (Checkpoint A)
          </Link>
          <Link
            href="/weight-room/stickers"
            className="rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Stickers
          </Link>
          <Link
            href="/weight-room/scans"
            className="rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Scans
          </Link>
          <Link
            href="/weight-room/rosters"
            className="rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Rosters
          </Link>
          <Link
            href="/weight-room/reports"
            className="rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm font-medium text-foreground hover:border-accent/50"
          >
            Reports
          </Link>
        </div>
      </main>
    </div>
  );
}
