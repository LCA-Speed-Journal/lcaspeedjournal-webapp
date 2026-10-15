import { NextRequest, NextResponse } from "next/server";
import { requireCoachSession } from "@/lib/require-coach";
import { isHugoGroup } from "@/lib/weight-room/constants";
import type { StrengthPattern } from "@/lib/strength/exercises";
import {
  editBaseline,
  listBaselines,
  saveAnchorBaselines,
} from "@/lib/strength/baselines";

const PATTERNS = new Set<string>([
  "squat",
  "hinge",
  "single_leg",
  "press",
  "pull",
  "power",
]);

function isPattern(value: unknown): value is StrengthPattern {
  return typeof value === "string" && PATTERNS.has(value);
}

function positiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function athleteIdOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id ? id : null;
}

async function readBody(
  request: NextRequest
): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }
> {
  try {
    const body: unknown = await request.json();
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
      };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const athleteId = searchParams.get("athlete_id")?.trim() ?? "";
    if (athleteId) {
      const data = await listBaselines({ athleteId });
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

    const data = await listBaselines({ hugoGroup: hugoGroupRaw });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/strength/baselines:", err);
    return NextResponse.json(
      { error: "Failed to load strength baselines" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;

  const athleteId = athleteIdOf(parsed.body.athlete_id);
  const squat = positiveNumber(parsed.body.squat);
  const bench = positiveNumber(parsed.body.bench);
  const power = positiveNumber(parsed.body.power);
  if (!athleteId) {
    return NextResponse.json({ error: "athlete_id is required" }, { status: 400 });
  }
  if (squat == null || bench == null || power == null) {
    return NextResponse.json(
      { error: "squat, bench, and power must be numbers greater than 0" },
      { status: 400 }
    );
  }

  try {
    const data = await saveAnchorBaselines({ athleteId, squat, bench, power });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("PUT /api/strength/baselines:", err);
    return NextResponse.json(
      { error: "Failed to save strength baselines" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;

  const athleteId = athleteIdOf(parsed.body.athlete_id);
  if (!athleteId) {
    return NextResponse.json({ error: "athlete_id is required" }, { status: 400 });
  }
  if (!isPattern(parsed.body.pattern)) {
    return NextResponse.json({ error: "Unknown pattern" }, { status: 400 });
  }
  const valueLb = positiveNumber(parsed.body.value_lb);
  if (valueLb == null) {
    return NextResponse.json(
      { error: "value_lb must be a number greater than 0" },
      { status: 400 }
    );
  }

  try {
    const data = await editBaseline({
      athleteId,
      pattern: parsed.body.pattern,
      valueLb,
    });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("PATCH /api/strength/baselines:", err);
    return NextResponse.json(
      { error: "Failed to update strength baseline" },
      { status: 500 }
    );
  }
}
