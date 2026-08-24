import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { loadDerivedCohort, ensureCohortConfig } from "@/lib/cohort-db";
import { COHORT_CONFIG_ID, parseCapacity, toPublicCohortPayload } from "@/lib/cohort";

export async function GET() {
  try {
    const derived = await loadDerivedCohort();
    return NextResponse.json({ data: toPublicCohortPayload(derived) });
  } catch (err) {
    console.error("GET /api/cohort:", err);
    return NextResponse.json({ error: "Failed to load cohort" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const capacity = parseCapacity(body?.capacity);
    if (capacity == null) {
      return NextResponse.json({ error: "capacity must be an integer >= 1" }, { status: 400 });
    }
    await ensureCohortConfig();
    await sql`
      UPDATE cohort_config
      SET capacity = ${capacity}, updated_at = NOW()
      WHERE id = ${COHORT_CONFIG_ID}
    `;
    const derived = await loadDerivedCohort();
    return NextResponse.json({ data: toPublicCohortPayload(derived) });
  } catch (err) {
    console.error("PATCH /api/cohort:", err);
    return NextResponse.json({ error: "Failed to update capacity" }, { status: 500 });
  }
}
