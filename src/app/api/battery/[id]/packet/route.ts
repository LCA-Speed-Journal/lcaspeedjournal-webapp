/**
 * Coach packet PDF. Coach only.
 * DRI boxes are read from day A entries and are not added to the public gym board.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { orderBoard } from "@/lib/battery/board-order";
import { DRI_BOXES, driBand, bestDriPerAthleteBox } from "@/lib/battery/dri";
import {
  isBatterySchemaMissing,
  loadBatteryBoard,
  readPgError,
  type BoardCell,
} from "@/lib/battery/load";
import {
  packetFilename,
  renderCoachPacket,
  type CoachPacketData,
  type PacketAthlete,
  type PacketComparison,
} from "@/lib/battery/packet";

export const runtime = "nodejs";

const MIGRATION_ERROR = "Run scripts/migrate-testing-battery.sql";

const COMPARISONS: { key: string; label: string }[] = [
  { key: "Standing-Broad", label: "Standing-Broad" },
  { key: "20yd_Dash", label: "20yd" },
  { key: "40yd_Dash", label: "40yd" },
  { key: "MaxVelocity", label: "MaxVelocity" },
  { key: "OH-MB_Throw", label: "OH-MB_Throw" },
];

function schemaResponse() {
  return NextResponse.json({ error: MIGRATION_ERROR }, { status: 503 });
}

function pdfResponse(buffer: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function finiteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function comparisonFor(
  cells: Record<string, BoardCell>,
  key: string,
  label: string
): PacketComparison {
  const cell = cells[key];
  return {
    label,
    current: cell?.value ?? null,
    september: cell?.delta?.previous ?? null,
    change: cell?.delta == null ? null : cell.delta.change,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const driPromise = sql`
      SELECT e.athlete_id, e.component, e.display_value
      FROM entries e
      INNER JOIN testing_battery_days d ON d.session_id = e.session_id
      WHERE d.battery_id = ${id}
        AND d.day_key = 'A'
        AND e.metric_key = 'DRI'
        AND e.component IS NOT NULL
    `;
    const [board, driResult] = await Promise.all([
      loadBatteryBoard(id, { view: "meet", group: "overall" }),
      driPromise,
    ]);
    if (!board) {
      return NextResponse.json({ error: "Battery not found" }, { status: 404 });
    }

    const trials = (driResult.rows as {
      athlete_id: unknown;
      component: unknown;
      display_value: unknown;
    }[]).flatMap((row) => {
      const value = finiteNumber(row.display_value);
      const box = row.component == null ? "" : String(row.component).trim();
      if (value == null || box === "" || row.athlete_id == null) return [];
      return [{ athlete_id: String(row.athlete_id), box, value }];
    });
    const driByAthlete = bestDriPerAthleteBox(trials);

    const athletes: PacketAthlete[] = orderBoard(board.athletes, board.untested_ids).map((row) => {
      const athlete = row.athlete;
      const marks = new Map(
        (driByAthlete.get(athlete.athlete_id) ?? []).map((mark) => [mark.box, mark.value])
      );
      const cells = athlete.cells;
      return {
        athlete_id: athlete.athlete_id,
        bib: athlete.bib,
        first_name: athlete.first_name,
        last_name: athlete.last_name,
        qualifier: athlete.qualifier,
        rsi: athlete.cells["10-5_RSI"]?.value ?? null,
        higher_box: athlete.higher_box,
        boxes: DRI_BOXES.map((box) => {
          const value = marks.get(box) ?? null;
          return { box, value, band: value == null ? null : driBand(value).label };
        }),
        comparisons: COMPARISONS.map((item) => comparisonFor(cells, item.key, item.label)),
      };
    });

    const data: CoachPacketData = {
      title: board.battery.title.trim() || "Boys Basketball Baseline",
      teamBox: board.battery.team_dri_box,
      athletes,
    };
    const buffer = await renderCoachPacket(data);
    return pdfResponse(buffer, packetFilename());
  } catch (err) {
    if (isBatterySchemaMissing(err)) return schemaResponse();
    if (readPgError(err).codes.includes("22P02")) {
      return NextResponse.json({ error: "Invalid id" }, { status: 404 });
    }
    console.error("GET /api/battery/[id]/packet:", err);
    return NextResponse.json({ error: "Failed to build coach packet" }, { status: 500 });
  }
}
