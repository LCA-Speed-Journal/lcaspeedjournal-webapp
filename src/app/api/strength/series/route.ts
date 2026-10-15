import { NextRequest, NextResponse } from "next/server";
import { requireCoachSession } from "@/lib/require-coach";
import { parseReportingDateRange } from "@/lib/reporting-date-range";
import { isHugoGroup } from "@/lib/weight-room/constants";
import { loadStrengthSeries } from "@/lib/strength/load-sets";

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const athleteId = searchParams.get("athlete_id")?.trim() ?? "";
    if (athleteId) {
      const data = await loadStrengthSeries({ athleteId });
      return NextResponse.json({ data });
    }

    const hugoGroupRaw = searchParams.get("hugo_group");
    if (!isHugoGroup(hugoGroupRaw)) {
      return NextResponse.json(
        {
          error: hugoGroupRaw
            ? "Invalid hugo_group"
            : "Provide athlete_id or hugo_group",
        },
        { status: 400 }
      );
    }

    const parsed = parseReportingDateRange({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status }
      );
    }

    const data = await loadStrengthSeries({
      hugoGroup: hugoGroupRaw,
      from: parsed.from,
      to: parsed.to,
    });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/strength/series:", err);
    return NextResponse.json(
      { error: "Failed to load strength series" },
      { status: 500 }
    );
  }
}
