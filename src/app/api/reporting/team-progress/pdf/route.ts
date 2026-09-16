import { NextRequest, NextResponse } from "next/server";
import { requireCoachSession } from "@/lib/require-coach";
import { isHugoGroup } from "@/lib/weight-room/constants";
import { parseTeamProgressDateRange } from "@/lib/team-progress/date-range";
import { buildTeamProgressPayload } from "@/lib/team-progress/build-payload";
import {
  renderTeamProgressPdf,
  teamProgressPdfFilename,
} from "@/lib/team-progress/pdf";

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
        { error: "Invalid or missing hugo_group" },
        { status: 400 }
      );
    }

    const parsed = parseTeamProgressDateRange({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status }
      );
    }

    const addedMetrics = searchParams
      .getAll("extra_metric")
      .map((s) => s.trim())
      .filter(Boolean);

    const f2fModeRaw = searchParams.get("f2f_mode");
    const f2fMode = f2fModeRaw === "best" ? "best" : "latest";

    const data = await buildTeamProgressPayload({
      hugoGroup: hugoGroupRaw,
      from: parsed.from,
      to: parsed.to,
      addedMetrics,
      f2fMode,
    });

    const buffer = await renderTeamProgressPdf(data);
    const filename = teamProgressPdfFilename(
      hugoGroupRaw,
      parsed.from,
      parsed.to
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/reporting/team-progress/pdf:", err);
    return NextResponse.json(
      { error: "Failed to render team progress PDF" },
      { status: 500 }
    );
  }
}
