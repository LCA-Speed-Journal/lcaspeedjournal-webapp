"use client";

import { useTheme } from "@/app/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Theme">
      {(["light", "dark", "system"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTheme(t)}
          aria-pressed={theme === t}
          aria-label={`Theme: ${t === "system" ? "System" : t === "light" ? "Light" : "Dark"}`}
          className="rounded border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-foreground hover:bg-surface hover:border-accent/50 aria-pressed:border-accent aria-pressed:bg-accent/20 aria-pressed:text-accent"
        >
          {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}
