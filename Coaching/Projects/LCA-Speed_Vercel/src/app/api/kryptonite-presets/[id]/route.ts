/**
 * Single kryptonite preset API - GET, PUT (auth), DELETE (auth).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { rows } = await sql`
      SELECT id, label, display_order, created_at
      FROM kryptonite_presets
      WHERE id = ${id}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    console.error("GET /api/kryptonite-presets/[id]:", err);
    return NextResponse.json(
      { error: "Failed to fetch preset" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = await request.json();
    const { label, display_order } = body;

    if (label !== undefined && (typeof label !== "string" || !label.trim())) {
      return NextResponse.json(
        { error: "Invalid label" },
        { status: 400 }
      );
    }

    if (label !== undefined && display_order !== undefined) {
      const order = Number(display_order);
      const { rows } = await sql`
        UPDATE kryptonite_presets
        SET label = ${label.trim()}, display_order = ${order}
        WHERE id = ${id}
        RETURNING id, label, display_order, created_at
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Preset not found" }, { status: 404 });
      }
      return NextResponse.json({ data: rows[0] });
    }
    if (label !== undefined) {
      const { rows } = await sql`
        UPDATE kryptonite_presets SET label = ${label.trim()} WHERE id = ${id}
        RETURNING id, label, display_order, created_at
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Preset not found" }, { status: 404 });
      }
      return NextResponse.json({ data: rows[0] });
    }
    if (display_order !== undefined) {
      const order = Number(display_order);
      const { rows } = await sql`
        UPDATE kryptonite_presets SET display_order = ${order} WHERE id = ${id}
        RETURNING id, label, display_order, created_at
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Preset not found" }, { status: 404 });
      }
      return NextResponse.json({ data: rows[0] });
    }

    return NextResponse.json(
      { error: "Provide label and/or display_order to update" },
      { status: 400 }
    );
  } catch (err) {
    const msg = String((err as Error)?.message ?? "").toLowerCase();
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("violates")) {
      return NextResponse.json(
        { error: "A preset with that label already exists" },
        { status: 400 }
      );
    }
    console.error("PUT /api/kryptonite-presets/[id]:", err);
    return NextResponse.json(
      { error: "Failed to update preset" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const { rows } = await sql`
      DELETE FROM kryptonite_presets WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    console.error("DELETE /api/kryptonite-presets/[id]:", err);
    return NextResponse.json(
      { error: "Failed to delete preset" },
      { status: 500 }
    );
  }
}
