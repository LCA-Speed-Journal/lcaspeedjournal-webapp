import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold">LCA Speed Journal</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Track & field and strength data — live leaderboards, athlete management
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="rounded-lg bg-black px-4 py-2 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
        >
          Coach login
        </Link>
        <a
          href="/api/athletes"
          className="rounded-lg border px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          API: Athletes
        </a>
      </div>
    </div>
  );
}
