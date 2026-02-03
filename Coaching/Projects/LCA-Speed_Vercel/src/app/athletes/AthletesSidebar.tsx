"use client";

import { useState } from "react";
import Link from "next/link";
import { AthleteForm } from "./AthleteForm";
import { AthleteRoster } from "./AthleteRoster";
import { ManageEventGroupsDialog } from "./ManageEventGroupsDialog";
import { ManagePresetsDialog } from "./ManagePresetsDialog";

type AthletesSidebarProps = {
  selectedAthleteId: string | null;
  onAthleteSelect: (id: string | null) => void;
};

export function AthletesSidebar({ selectedAthleteId, onAthleteSelect }: AthletesSidebarProps) {
  const [manageEventGroupsOpen, setManageEventGroupsOpen] = useState(false);
  const [managePresetsOpen, setManagePresetsOpen] = useState(false);

  return (
    <aside className="flex h-full flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div>
          <div className="mb-2 inline-block h-1 w-12 rounded-full bg-accent" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Manage athletes
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/data-entry"
            className="rounded-xl border border-border bg-surface-elevated px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
          >
            Data entry
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-border bg-surface-elevated px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface hover:shadow-md"
          >
            Home
          </Link>
        </div>
      </header>

      {/* Add Athlete Section */}
      <section>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Add athlete
        </p>
        <AthleteForm />
      </section>

      {/* Roster Section */}
      <section className="flex-1 overflow-y-auto">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Roster
        </p>
        <AthleteRoster 
          selectedAthleteId={selectedAthleteId}
          onAthleteSelect={onAthleteSelect}
        />
      </section>

      {/* Quick Links Section */}
      <section className="border-t border-border pt-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-muted">
          Settings
        </p>
        <div className="flex flex-col gap-2">
          <ManageEventGroupsDialog
            open={manageEventGroupsOpen}
            onClose={() => setManageEventGroupsOpen(false)}
          />
          <button
            type="button"
            onClick={() => setManageEventGroupsOpen(true)}
            className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-left text-xs font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface"
          >
            Manage Event Groups
          </button>
          <ManagePresetsDialog
            open={managePresetsOpen}
            onClose={() => setManagePresetsOpen(false)}
          />
          <button
            type="button"
            onClick={() => setManagePresetsOpen(true)}
            className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-left text-xs font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface"
          >
            Manage Presets
          </button>
          <Link
            href="/settings"
            className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-center text-xs font-medium text-foreground transition-all hover:border-accent/50 hover:bg-surface"
          >
            Settings
          </Link>
        </div>
      </section>
    </aside>
  );
}
