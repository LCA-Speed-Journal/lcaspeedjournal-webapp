import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import { parseReportingDateRange } from "@/lib/reporting-date-range";
import { isHugoGroup, type HugoGroup } from "@/lib/weight-room/constants";
import { isUuid } from "@/lib/weight-room/insert-template";
import {
  aggregateWeightRoomReport,
  isWeightRoomReportRangeTooLong,
  WEIGHT_ROOM_REPORT_RANGE_ERROR,
} from "@/lib/weight-room/report-aggregate";
import { loadAthleteAggregateInput } from "@/lib/weight-room/report-load";
import {
  athleteReportFilename,
  renderWeightRoomReportPdf,
} from "@/lib/weight-room/report-pdf";

export const runtime = "nodejs";

function athleteHugoGroup(raw: unknown, fallback?: string): HugoGroup {
  if (isHugoGroup(raw)) return raw;
  if (isHugoGroup(fallback)) return fallback;
  return "extracurricular";
}

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const athleteIdRaw = searchParams.get("athlete_id");
    if (!isUuid(athleteIdRaw)) {
      return NextResponse.json(
        { error: "Invalid athlete_id" },
        { status: 400 }
      );
    }
    const athleteId = athleteIdRaw.trim();

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

    const { rows } = await sql`
      SELECT id, first_name, last_name, hugo_group
      FROM athletes
      WHERE id = ${athleteId}::uuid
    `;
    const athlete = rows[0] as
      | {
          id: string;
          first_name: string;
          last_name: string;
          hugo_group: string | null;
        }
      | undefined;
    if (!athlete) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
    }

    const input = await loadAthleteAggregateInput({
      hugo_group: athleteHugoGroup(athlete.hugo_group),
      athlete_id: athleteId,
      from: parsed.from,
      to: parsed.to,
    });
    if (input.logs[0] && isHugoGroup(input.logs[0].hugo_group)) {
      input.hugo_group = input.logs[0].hugo_group;
    }

    const report = aggregateWeightRoomReport(input);
    const heading = `${athlete.first_name} ${athlete.last_name}`.trim();
    const buffer = await renderWeightRoomReportPdf({
      report,
      heading: heading || "Athlete report",
    });
    const filename = athleteReportFilename(athleteId, parsed.from, parsed.to);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/weight-room/reports/athlete:", err);
    return NextResponse.json(
      { error: "Failed to build athlete report" },
      { status: 500 }
    );
  }
}
