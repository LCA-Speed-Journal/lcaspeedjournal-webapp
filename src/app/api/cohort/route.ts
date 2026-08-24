import { NextResponse } from "next/server";
import { loadDerivedCohort } from "@/lib/cohort-db";
import { toPublicCohortPayload } from "@/lib/cohort";

export async function GET() {
  try {
    const derived = await loadDerivedCohort();
    return NextResponse.json({ data: toPublicCohortPayload(derived) });
  } catch (err) {
    console.error("GET /api/cohort:", err);
    return NextResponse.json({ error: "Failed to load cohort" }, { status: 500 });
  }
}
