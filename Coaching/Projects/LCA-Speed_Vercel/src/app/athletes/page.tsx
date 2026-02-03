import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PageBackground } from "@/app/components/PageBackground";
import { AthletesClient } from "./AthletesClient";

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

export default async function AthletesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
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

  const params = await searchParams;
  const selectedAthleteId = params.id ?? null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <PageBackground />
      <AthletesClient selectedAthleteId={selectedAthleteId} />
    </div>
  );
}
