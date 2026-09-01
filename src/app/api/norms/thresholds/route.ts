/**
 * Coach GET/PUT for a population + metric + component threshold slice.
 * PUT replaces only that slice; client sends filled cells only (empty = delete).
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCoachSession } from "@/lib/require-coach";
import {
  parseThresholdSliceQuery,
  parseThresholdSliceReplace,
} from "@/lib/norms/editor";

type ThresholdRow = {
  gender: string;
  label: string;
  threshold: unknown;
  component: string | null;
};

function mapThresholdRows(rows: ThresholdRow[], sliceComponent: string | null) {
  return rows.map((row) => ({
    gender: row.gender,
    label: row.label,
    threshold: Number(row.threshold),
    component: row.component == null || row.component === "" ? sliceComponent : row.component,
  }));
}

function cellsFromBody(body: unknown): unknown {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object" && "cells" in body) {
    return (body as { cells: unknown }).cells;
  }
  return body;
}

export async function GET(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseThresholdSliceQuery(searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { population_id, metric_key, component } = parsed.value;
  const componentKey = component ?? "";

  try {
    const { rows } = await sql`
      SELECT gender, label, threshold, component
      FROM norm_thresholds
      WHERE population_id = ${population_id}
        AND metric_key = ${metric_key}
        AND COALESCE(component, '') = ${componentKey}
    `;
    return NextResponse.json({
      data: mapThresholdRows(rows as ThresholdRow[], component),
    });
  } catch (err) {
    console.error("GET /api/norms/thresholds:", err);
    return NextResponse.json(
      { error: "Failed to fetch thresholds" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireCoachSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const extra =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const parsed = parseThresholdSliceReplace({
    population_id: searchParams.get("population_id") ?? extra.population_id,
    metric_key: searchParams.get("metric_key") ?? extra.metric_key,
    component: searchParams.has("component")
      ? searchParams.get("component")
      : extra.component,
    cells: cellsFromBody(body),
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { population_id, metric_key, component, cells } = parsed.value;
  const componentKey = component ?? "";

  try {
    const popResult = await sql`
      SELECT id, archived_at
      FROM norm_populations
      WHERE id = ${population_id}
      LIMIT 1
    `;
    if (popResult.rows.length === 0) {
      return NextResponse.json({ error: "Population not found" }, { status: 404 });
    }

    const cellsJson = JSON.stringify(
      cells.map((cell) => ({
        gender: cell.gender,
        label: cell.label,
        threshold: cell.threshold,
      }))
    );

    // One statement: DELETE the slice and INSERT filled cells.
    // If INSERT fails, the DELETE rolls back with it.
    await sql`
      WITH deleted AS (
        DELETE FROM norm_thresholds
        WHERE population_id = ${population_id}
          AND metric_key = ${metric_key}
          AND COALESCE(component, '') = ${componentKey}
      )
      INSERT INTO norm_thresholds (
        population_id, metric_key, gender, component, label, threshold
      )
      SELECT
        ${population_id},
        ${metric_key},
        incoming.gender,
        ${component},
        incoming.label,
        incoming.threshold
      FROM json_to_recordset(CAST(${cellsJson} AS json)) AS incoming(
        gender text,
        label text,
        threshold numeric
      )
    `;

    return NextResponse.json({
      data: cells.map((cell) => ({
        gender: cell.gender,
        label: cell.label,
        threshold: cell.threshold,
        component,
      })),
    });
  } catch (err) {
    console.error("PUT /api/norms/thresholds:", err);
    return NextResponse.json(
      { error: "Failed to save thresholds" },
      { status: 500 }
    );
  }
}
