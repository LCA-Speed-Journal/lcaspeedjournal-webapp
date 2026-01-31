import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { AthleteForm } from "./AthleteForm";
import { AthleteRoster } from "./AthleteRoster";

export const dynamic = "force-dynamic";

function AthletesError({ message }: { message: string }) {
  return (
    <div className="min-h-screen p-4 md:p-8">
      <h1 className="text-xl font-bold text-red-600 dark:text-red-400">
        Athlete management error
      </h1>
      <p className="mt-2 font-mono text-sm text-zinc-700 dark:text-zinc-300">
        {message}
      </p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        Home
      </Link>
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
    <div className="min-h-screen p-4 md:p-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Athlete management</h1>
        <div className="flex gap-2">
          <Link
            href="/data-entry"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Data entry
          </Link>
          <Link
            href="/"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Home
          </Link>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Add athlete</h2>
        <AthleteForm />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Roster</h2>
        <AthleteRoster />
      </section>
    </div>
  );
}
