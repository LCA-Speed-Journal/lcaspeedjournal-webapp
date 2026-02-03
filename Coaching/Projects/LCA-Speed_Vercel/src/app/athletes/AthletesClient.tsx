"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AthletesSidebar } from "./AthletesSidebar";
import { TeamOverviewDashboard } from "./TeamOverviewDashboard";
import { AthleteDashboard } from "./AthleteDashboard";

type AthletesClientProps = {
  selectedAthleteId: string | null;
};

export function AthletesClient({ selectedAthleteId }: AthletesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleAthleteSelect = (id: string | null) => {
    if (id) {
      router.push(`/athletes?id=${id}`);
    } else {
      router.push("/athletes");
    }
  };

  const cardClass =
    "rounded-2xl border-2 border-border/80 bg-surface/90 shadow-2xl shadow-black/30 backdrop-blur-sm ring-1 ring-white/5 md:p-8";
  const cardStyle = {
    boxShadow:
      "0 0 15px 2px rgba(255,255,255,0.04), 0 25px 50px -12px rgba(0,0,0,0.3)",
  };

  return (
    <div className="relative z-10 flex min-h-screen">
      {/* Sidebar - same surface/border as rest of app */}
      <div className="w-full border-r border-border/80 bg-surface/90 backdrop-blur-sm md:w-80 lg:w-96">
        <div className="h-full overflow-y-auto p-6">
          <AthletesSidebar
            selectedAthleteId={selectedAthleteId}
            onAthleteSelect={handleAthleteSelect}
          />
        </div>
      </div>

      {/* Main content: background shows through; center card matches data-entry/settings */}
      <div className="hidden flex-1 overflow-y-auto px-6 py-8 md:block md:px-8 md:py-10">
        <div className="mx-auto max-w-4xl">
          <div className={`p-6 ${cardClass}`} style={cardStyle}>
            {selectedAthleteId ? (
              <AthleteDashboard athleteId={selectedAthleteId} />
            ) : (
              <TeamOverviewDashboard />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
