/**
 * Athlete kryptonite API - GET (list), POST (add preset or custom), DELETE (remove).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: athleteId } = await params;
  try {
    const { rows } = await sql`
      SELECT k.id, k.athlete_id, k.preset_id, k.custom_text, k.detail, k.display_order, k.created_at, p.label AS preset_label
      FROM athlete_kryptonite k
      LEFT JOIN kryptonite_presets p ON p.id = k.preset_id
      WHERE k.athlete_id = ${athleteId}
      ORDER BY k.display_order ASC, k.created_at ASC
    `;
    const data = (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      athlete_id: r.athlete_id,
      preset_id: r.preset_id,
      custom_text: r.custom_text,
      detail: r.detail,
      display_order: r.display_order,
      created_at: String(r.created_at),
      label: r.preset_label ?? r.custom_text ?? "",
    }));
    return NextResponse.json({ data });
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("does not exist") || msg.includes("relation")) {
      return NextResponse.json({ data: [] });
    }
    console.error("GET /api/athletes/[id]/kryptonite:", err);
    return NextResponse.json(
      { error: "Failed to fetch kryptonite" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: athleteId } = await params;
  try {
    const body = await request.json();
    const { preset_id, custom_text, detail, display_order } = body;

    const hasPreset = preset_id != null && preset_id !== "";
    const hasCustom = custom_text != null && typeof custom_text === "string" && custom_text.trim() !== "";

    if (!hasPreset && !hasCustom) {
      return NextResponse.json(
        { error: "Provide preset_id or custom_text" },
        { status: 400 }
      );
    }
    if (hasPreset && hasCustom) {
      return NextResponse.json(
        { error: "Provide either preset_id or custom_text, not both" },
        { status: 400 }
      );
    }

    const order = display_order != null ? Number(display_order) : 0;
    const presetVal = hasPreset ? preset_id : null;
    const customVal = hasCustom ? (custom_text as string).trim() : null;
    const detailVal = detail != null && (detail as string).trim() !== "" ? (detail as string).trim() : null;

    const { rows } = await sql`
      INSERT INTO athlete_kryptonite (athlete_id, preset_id, custom_text, detail, display_order)
      VALUES (${athleteId}, ${presetVal}, ${customVal}, ${detailVal}, ${order})
      RETURNING id, athlete_id, preset_id, custom_text, detail, display_order, created_at
    `;
    const row = rows[0] as Record<string, unknown>;
    if (row?.created_at) row.created_at = String(row.created_at);
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("foreign key") || msg.includes("violates")) {
      return NextResponse.json(
        { error: "Athlete or preset not found" },
        { status: 404 }
      );
    }
    if (msg.includes("kryptonite_preset_or_custom") || msg.includes("check")) {
      return NextResponse.json(
        { error: "Provide exactly one of preset_id or custom_text" },
        { status: 400 }
      );
    }
    console.error("POST /api/athletes/[id]/kryptonite:", err);
    return NextResponse.json(
      { error: "Failed to add kryptonite" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: athleteId } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("id");

    if (!itemId) {
      return NextResponse.json(
        { error: "Missing id query parameter" },
        { status: 400 }
      );
    }

    const { rows } = await sql`
      DELETE FROM athlete_kryptonite
      WHERE id = ${itemId} AND athlete_id = ${athleteId}
      RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Kryptonite item not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: { removed: true } });
  } catch (err) {
    console.error("DELETE /api/athletes/[id]/kryptonite:", err);
    return NextResponse.json(
      { error: "Failed to remove kryptonite" },
      { status: 500 }
    );
  }
}
