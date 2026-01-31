"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type AthleteType = "athlete" | "staff" | "alumni";

export function AthleteForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [athleteType, setAthleteType] = useState<AthleteType>("athlete");
  const [graduatingClass, setGraduatingClass] = useState(
    () => new Date().getFullYear() + 2
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { mutate } = useSWR("/api/athletes", fetcher);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        gender,
        athlete_type: athleteType,
      };
      if (athleteType === "athlete") {
        payload.graduating_class = graduatingClass;
      }
      const res = await fetch("/api/athletes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to add athlete");
        return;
      }
      setSuccess(`${firstName} ${lastName} added`);
      setFirstName("");
      setLastName("");
      mutate();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-4 shadow-lg shadow-black/20 md:p-6"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="athlete_first" className="mb-1 block text-sm font-medium text-foreground">
            First name
          </label>
          <input
            id="athlete_first"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
            required
          />
        </div>
        <div>
          <label htmlFor="athlete_last" className="mb-1 block text-sm font-medium text-foreground">
            Last name
          </label>
          <input
            id="athlete_last"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="athlete_type" className="mb-1 block text-sm font-medium text-foreground">
            Type
          </label>
          <select
            id="athlete_type"
            value={athleteType}
            onChange={(e) => setAthleteType(e.target.value as AthleteType)}
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
          >
            <option value="athlete">Athlete</option>
            <option value="staff">Staff</option>
            <option value="alumni">Alumni</option>
          </select>
        </div>
        <div>
          <label htmlFor="athlete_gender" className="mb-1 block text-sm font-medium text-foreground">
            Gender
          </label>
          <select
            id="athlete_gender"
            value={gender}
            onChange={(e) => setGender(e.target.value as "M" | "F")}
            className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
          >
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </div>
        {athleteType === "athlete" && (
          <div>
            <label htmlFor="athlete_class" className="mb-1 block text-sm font-medium text-foreground">
              Graduating class
            </label>
            <input
              id="athlete_class"
              type="number"
              min={2024}
              max={2032}
              value={graduatingClass}
              onChange={(e) => setGraduatingClass(Number(e.target.value))}
              className="min-h-[44px] w-full rounded border border-border bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-accent"
              required
            />
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-accent" role="status">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="min-h-[44px] w-full rounded-lg bg-accent px-4 py-3 font-medium text-background hover:bg-accent-hover disabled:opacity-50 transition-colors"
      >
        {loading ? "Adding…" : "Add athlete"}
      </button>
    </form>
  );
}
