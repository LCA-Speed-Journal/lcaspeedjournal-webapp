import { NextRequest, NextResponse } from "next/server";
import { requireCoachSession } from "@/lib/require-coach";
import { loadWorkingWeightTable } from "@/lib/strength/working-weight-table";
import { isUuid } from "@/lib/weight-room/insert-template";

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const templateId =
    new URL(request.url).searchParams.get("template_id")?.trim() ?? "";
  if (!isUuid(templateId)) {
    return NextResponse.json(
      { error: "template_id is required and must be a UUID" },
      { status: 400 }
    );
  }

  try {
    const result = await loadWorkingWeightTable(templateId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }
    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("GET /api/strength/working-weights:", err);
    return NextResponse.json(
      { error: "Failed to load working weights" },
      { status: 500 }
    );
  }
}
