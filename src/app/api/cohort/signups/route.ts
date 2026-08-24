import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { loadDerivedCohort } from "@/lib/cohort-db";
import { parseSignupBody } from "@/lib/cohort";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const derived = await loadDerivedCohort();
    return NextResponse.json({
      data: {
        title: derived.title,
        capacity: derived.capacity,
        claimed: derived.claimed,
        remaining: derived.remaining,
        in_cohort: derived.inCohort,
        waitlist: derived.waitlist,
        signups: derived.signups,
      },
    });
  } catch (err) {
    console.error("GET /api/cohort/signups:", err);
    return NextResponse.json({ error: "Failed to load signups" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const parsed = parseSignupBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { rows } = await sql`
      INSERT INTO cohort_signups (display_name, grade, email)
      VALUES (${parsed.display_name}, ${parsed.grade}, ${parsed.email})
      RETURNING id, display_name, grade, email, created_at
    `;
    const derived = await loadDerivedCohort();
    return NextResponse.json(
      { data: { signup: rows[0], remaining: derived.remaining, claimed: derived.claimed } },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/cohort/signups:", err);
    return NextResponse.json({ error: "Failed to add signup" }, { status: 500 });
  }
}
