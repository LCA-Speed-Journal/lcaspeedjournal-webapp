import { NextRequest, NextResponse } from "next/server";
import { requireCoachSession } from "@/lib/require-coach";
import { parseReportingDateRange } from "@/lib/reporting-date-range";
import { isHugoGroup } from "@/lib/weight-room/constants";
import { buildWeightRoomOverview } from "@/lib/weight-room/overview-aggregate";
import {
  aggregateWeightRoomReport,
  isWeightRoomReportRangeTooLong,
  WEIGHT_ROOM_REPORT_RANGE_ERROR,
} from "@/lib/weight-room/report-aggregate";
import {
  loadRoster,
  loadTeamAggregateInput,
} from "@/lib/weight-room/report-load";

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const hugoGroupRaw = searchParams.get("hugo_group");
    if (!isHugoGroup(hugoGroupRaw)) {
      return NextResponse.json(
        { error: "Invalid hugo_group" },
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
    if (isWeightRoomReportRangeTooLong(parsed.from, parsed.to)) {
      return NextResponse.json(
        { error: WEIGHT_ROOM_REPORT_RANGE_ERROR },
        { status: 400 }
      );
    }

    const [input, roster] = await Promise.all([
      loadTeamAggregateInput({
        hugo_group: hugoGroupRaw,
        from: parsed.from,
        to: parsed.to,
      }),
      loadRoster(hugoGroupRaw),
    ]);
    const report = aggregateWeightRoomReport(input);
    const data = buildWeightRoomOverview(report, roster);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/weight-room/overview:", err);
    return NextResponse.json(
      { error: "Failed to load overview" },
      { status: 500 }
    );
  }
}
