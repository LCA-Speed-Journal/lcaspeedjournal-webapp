/**
 * Kryptonite presets API - GET (public list), POST (auth required).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await sql`
      SELECT id, label, display_order, created_at
      FROM kryptonite_presets
      ORDER BY display_order ASC, label ASC
    `;
    return NextResponse.json({ data: rows });
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("does not exist") || msg.includes("relation")) {
      return NextResponse.json({ data: [] });
    }
    console.error("GET /api/kryptonite-presets:", err);
    return NextResponse.json(
      { error: "Failed to fetch kryptonite presets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { label, display_order } = body;

    if (!label || typeof label !== "string" || !label.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid label" },
        { status: 400 }
      );
    }

    const order = display_order != null ? Number(display_order) : 0;

    const { rows } = await sql`
      INSERT INTO kryptonite_presets (label, display_order)
      VALUES (${label.trim()}, ${order})
      RETURNING id, label, display_order, created_at
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (err) {
    const e = err as Error & { code?: string };
    const msg = String(e?.message ?? "").toLowerCase();
    if (e?.code === "23505" || msg.includes("unique") || msg.includes("duplicate") || msg.includes("violates")) {
      return NextResponse.json(
        { error: "A preset with that label already exists" },
        { status: 400 }
      );
    }
    console.error("POST /api/kryptonite-presets:", err);
    return NextResponse.json(
      { error: "Failed to create kryptonite preset" },
      { status: 500 }
    );
  }
}
