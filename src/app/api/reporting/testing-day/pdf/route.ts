import { NextRequest, NextResponse } from "next/server";
import { requireCoachSession } from "@/lib/require-coach";
import { parsePopulationIdParam } from "@/lib/norms/leaderboard-zones";
import { buildTestingDayBoard } from "@/lib/norms/testing-day-board";
import {
  renderTestingDayPdf,
  testingDayPdfFilename,
  type TestingDayPdfAudience,
} from "@/lib/norms/testing-day-pdf";

export const runtime = "nodejs";

function isAudience(value: string | null): value is TestingDayPdfAudience {
  return value === "coach" || value === "athlete";
}

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const audience = searchParams.get("audience");
    if (!isAudience(audience)) {
      return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
    }

    const session_id = searchParams.get("session_id");
    if (!session_id) {
      return NextResponse.json(
        { error: "Missing required query params: session_id" },
        { status: 400 }
      );
    }

    const parsedPopulation = parsePopulationIdParam(
      searchParams.get("population_id")
    );
    if (!parsedPopulation.ok) {
      return NextResponse.json(
        { error: parsedPopulation.error },
        { status: 400 }
      );
    }

    const result = await buildTestingDayBoard(
      session_id,
      parsedPopulation.populationId
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    const board = result.data;
    const buffer = await renderTestingDayPdf({ board, audience });
    const filename = testingDayPdfFilename(board.session_date, audience);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/reporting/testing-day/pdf:", err);
    return NextResponse.json(
      { error: "Failed to build testing-day PDF" },
      { status: 500 }
    );
  }
}
