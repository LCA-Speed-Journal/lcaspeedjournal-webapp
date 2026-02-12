"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type SessionItem = {
  id: string;
  session_date: string;
  phase: string;
  phase_week: number;
};

export function PickSessionControl({ currentSessionId }: { currentSessionId: string }) {
  const router = useRouter();
  const { data } = useSWR<{ data?: SessionItem[] }>("/api/sessions", fetcher);
  const sessions = data?.data ?? [];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground-muted">Edit another session…</p>
      <select
        value={currentSessionId}
        onChange={(e) => {
          const id = e.target.value;
          if (id && id !== currentSessionId) {
            router.push(`/data-entry/session/${id}`);
          }
        }}
        className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-accent"
        aria-label="Pick session to edit"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {String(s.session_date).slice(0, 10)} — {s.phase}
            {Number(s.phase_week) === 0 ? "" : ` wk ${s.phase_week}`}
          </option>
        ))}
      </select>
    </div>
  );
}
