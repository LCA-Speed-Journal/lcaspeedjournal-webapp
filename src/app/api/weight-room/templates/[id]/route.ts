import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import {
  TEMPLATE_HAS_LOGS_ERROR,
  getTemplateWithMovements,
  isUuid,
  parseTemplatePatch,
  replaceTemplateMovements,
  templateHasSessionLogs,
  updateTemplateFields,
} from "@/lib/weight-room/insert-template";

function invalidId() {
  return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Template not found" }, { status: 404 });
}

function conflictLogs() {
  return NextResponse.json({ error: TEMPLATE_HAS_LOGS_ERROR }, { status: 409 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await params;
  if (!isUuid(rawId)) {
    return invalidId();
  }
  const id = rawId.trim();

  try {
    const template = await getTemplateWithMovements(id);
    if (!template) {
      return notFound();
    }
    return NextResponse.json({ data: template });
  } catch (err) {
    console.error("GET /api/weight-room/templates/[id]:", err);
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await params;
  if (!isUuid(rawId)) {
    return invalidId();
  }
  const id = rawId.trim();

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = parseTemplatePatch(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const patch = parsed.value;

    const current = await getTemplateWithMovements(id);
    if (!current) {
      return notFound();
    }

    if (await templateHasSessionLogs(id)) {
      return conflictLogs();
    }

    const hasFieldPatch =
      patch.hugo_group !== undefined ||
      patch.week_number !== undefined ||
      patch.day_name !== undefined ||
      patch.session_date !== undefined ||
      patch.focus !== undefined ||
      patch.title !== undefined;

    if (hasFieldPatch) {
      await updateTemplateFields(id, current, patch);
    }
    if (patch.movements) {
      await replaceTemplateMovements(id, patch.movements);
    }

    const updated = await getTemplateWithMovements(id);
    if (!updated) {
      return notFound();
    }
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("PATCH /api/weight-room/templates/[id]:", err);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await params;
  if (!isUuid(rawId)) {
    return invalidId();
  }
  const id = rawId.trim();

  try {
    const current = await getTemplateWithMovements(id);
    if (!current) {
      return notFound();
    }
    if (await templateHasSessionLogs(id)) {
      return conflictLogs();
    }

    await sql`DELETE FROM workout_templates WHERE id = ${id}`;
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("DELETE /api/weight-room/templates/[id]:", err);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
