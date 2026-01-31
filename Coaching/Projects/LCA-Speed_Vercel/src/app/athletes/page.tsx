import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { PageBackground } from "@/app/components/PageBackground";
import { AthleteForm } from "./AthleteForm";
import { AthleteRoster } from "./AthleteRoster";

export const dynamic = "force-dynamic";

function AthletesError({ message }: { message: string }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-8 md:px-8 md:py-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="rounded-2xl border-2 border-border/80 bg-surface/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8" style={{ boxShadow: "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)" }}>
          <h1 className="text-xl font-bold text-danger">Athlete management error</h1>
          <p className="mt-2 font-mono text-sm text-foreground">{message}</p>
          <Link href="/" className="mt-4 inline-block text-sm text-accent hover:text-accent-hover">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function AthletesPage() {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[athletes] server error:", err);
    return <AthletesError message={message} />;
  }

  if (!session) {
    redirect("/login?callbackUrl=/athletes");
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
                Athlete management
              </h1>
            </div>
            <div className="flex gap-2">
              <Link
                href="/data-entry"
                className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
              >
                Data entry
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
              Add athlete
            </p>
            <AthleteForm />
          </section>

          <section>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
              Roster
            </p>
            <AthleteRoster />
          </section>
        </div>
      </div>
    </div>
  );
}
