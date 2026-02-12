"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function EditSessionClient({ sessionId }: { sessionId: string }) {
  const { data, error, isLoading } = useSWR(
    `/api/sessions/${sessionId}`,
    fetcher
  );

  if (isLoading) return <p className="text-foreground-muted">Loading session…</p>;
  if (error) return <p className="text-danger">Failed to load session.</p>;
  if (!data?.data) return <p className="text-foreground-muted">Session not found.</p>;

  return (
    <div>
      <h2 className="text-lg font-bold text-foreground">Edit session</h2>
      <p className="text-sm text-foreground-muted">
        {data.data.session_date} — {data.data.phase}
      </p>
    </div>
  );
}
