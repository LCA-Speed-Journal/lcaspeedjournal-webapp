import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { parseSignupBody } from "@/lib/cohort";

export async function PATCH(
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
    const parsed = parseSignupBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { rows } = await sql`
      UPDATE cohort_signups
      SET
        display_name = ${parsed.display_name},
        grade = ${parsed.grade},
        email = ${parsed.email}
      WHERE id = ${id}
      RETURNING id, display_name, grade, email, created_at
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Signup not found" }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    console.error("PATCH /api/cohort/signups/[id]:", err);
    return NextResponse.json({ error: "Failed to update signup" }, { status: 500 });
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
      DELETE FROM cohort_signups
      WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Signup not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id } });
  } catch (err) {
    console.error("DELETE /api/cohort/signups/[id]:", err);
    return NextResponse.json({ error: "Failed to delete signup" }, { status: 500 });
  }
}
