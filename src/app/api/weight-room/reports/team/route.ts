import { NextRequest, NextResponse } from "next/server";
import { requireCoachSession } from "@/lib/require-coach";
import { parseReportingDateRange } from "@/lib/reporting-date-range";
import { HUGO_GROUP_META, isHugoGroup } from "@/lib/weight-room/constants";
import {
  aggregateWeightRoomReport,
  isWeightRoomReportRangeTooLong,
  WEIGHT_ROOM_REPORT_RANGE_ERROR,
} from "@/lib/weight-room/report-aggregate";
import { loadTeamAggregateInput } from "@/lib/weight-room/report-load";
import {
  renderWeightRoomReportPdf,
  teamReportFilename,
} from "@/lib/weight-room/report-pdf";

export const runtime = "nodejs";

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

    const input = await loadTeamAggregateInput({
      hugo_group: hugoGroupRaw,
      from: parsed.from,
      to: parsed.to,
    });
    const report = aggregateWeightRoomReport(input);
    const buffer = await renderWeightRoomReportPdf({
      report,
      heading: `${HUGO_GROUP_META[hugoGroupRaw].label} team report`,
    });
    const filename = teamReportFilename(hugoGroupRaw, parsed.from, parsed.to);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/weight-room/reports/team:", err);
    return NextResponse.json(
      { error: "Failed to build team report" },
      { status: 500 }
    );
  }
}
