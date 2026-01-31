"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AthleteForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
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
      const res = await fetch("/api/athletes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          gender,
          graduating_class: graduatingClass,
        }),
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
      className="max-w-xl space-y-4 rounded-lg border p-4 shadow-sm md:p-6"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="athlete_first" className="mb-1 block text-sm font-medium">
            First name
          </label>
          <input
            id="athlete_first"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="min-h-[44px] w-full rounded border px-3 py-2 text-base"
            required
          />
        </div>
        <div>
          <label htmlFor="athlete_last" className="mb-1 block text-sm font-medium">
            Last name
          </label>
          <input
            id="athlete_last"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="min-h-[44px] w-full rounded border px-3 py-2 text-base"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="athlete_gender" className="mb-1 block text-sm font-medium">
            Gender
          </label>
          <select
            id="athlete_gender"
            value={gender}
            onChange={(e) => setGender(e.target.value as "M" | "F")}
            className="min-h-[44px] w-full rounded border px-3 py-2 text-base"
          >
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </div>
        <div>
          <label htmlFor="athlete_class" className="mb-1 block text-sm font-medium">
            Graduating class
          </label>
          <input
            id="athlete_class"
            type="number"
            min={2024}
            max={2032}
            value={graduatingClass}
            onChange={(e) => setGraduatingClass(Number(e.target.value))}
            className="min-h-[44px] w-full rounded border px-3 py-2 text-base"
            required
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600 dark:text-green-400" role="status">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="min-h-[44px] w-full rounded-lg bg-black px-4 py-3 text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
      >
        {loading ? "Adding…" : "Add athlete"}
      </button>
    </form>
  );
}
