/**
 * Entry parsing engine — mirrors Python data_intake/parser.py.
 * Transforms raw coach input into entry rows based on metric input_structure:
 * single_interval, cumulative, paired_components.
 */
import type { ConversionFormula } from "./conversions";
import { convertValue } from "./conversions";
import metricsData from "./metrics.json";

export type ParsedEntry = {
  metric_key: string;
  interval_index: number | null;
  component: string | null;
  value: number;
  display_value: number;
  units: string;
};

type MetricDef = {
  display_name: string;
  input_units: string;
  display_units: string;
  conversion_formula: ConversionFormula | string;
  input_structure: "single_interval" | "cumulative" | "paired_components";
  default_splits: (number | string)[];
  category?: string;
  subcategory?: string;
};

const metrics = metricsData as Record<string, MetricDef>;

function splitValues(raw: string): string[] {
  return raw
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getMetric(displayName: string): MetricDef | undefined {
  return metrics[displayName];
}

function formatIntervalLabel(startM: number, endM: number): string {
  return `${startM}-${endM}m`;
}

function extractIntervalFromName(displayName: string): [number, number] | null {
  const match = displayName.match(/(\d+)-(\d+)m?/);
  if (match) {
    return [parseInt(match[1], 10), parseInt(match[2], 10)];
  }
  return null;
}

function applyConversion(
  inputValue: number,
  formula: string,
  intervalDistanceM?: number
): number {
  const opts = formula === "velocity_mph" ? { distanceM: intervalDistanceM, timeS: inputValue } : undefined;
  return convertValue(
    inputValue,
    formula as ConversionFormula,
    opts
  );
}

type SessionOverrides = {
  day_splits?: Record<string, number[]>;
  day_components?: Record<string, string[]>;
};

/**
 * Parse raw input into one or more entry rows.
 * @param metricKey - Metric display_name from registry
 * @param rawInput - Coach-entered value(s); pipe-separated for cumulative/paired
 * @param sessionOverrides - Optional day_splits, day_components from session
 */
export function parseEntry(
  metricKey: string,
  rawInput: string,
  sessionOverrides?: SessionOverrides
): ParsedEntry[] {
  const metric = getMetric(metricKey);
  if (!metric) {
    throw new Error(`Unknown metric: ${metricKey}`);
  }

  const inputStructure = metric.input_structure;

  if (inputStructure === "single_interval") {
    return parseSingleInterval(metric, rawInput.trim());
  }
  if (inputStructure === "cumulative") {
    const splits =
      sessionOverrides?.day_splits?.[metricKey] ?? metric.default_splits;
    const splitNums = (splits as number[]).filter((s) => typeof s === "number");
    if (splitNums.length === 0) {
      throw new Error(`No splits for cumulative metric ${metricKey}`);
    }
    return parseCumulative(metric, rawInput, splitNums);
  }
  if (inputStructure === "paired_components") {
    const labels =
      sessionOverrides?.day_components?.[metricKey] ?? metric.default_splits;
    const labelStrs = (labels as string[]).filter((s) => typeof s === "string");
    if (labelStrs.length === 0) {
      throw new Error(`No component labels for paired metric ${metricKey}`);
    }
    return parsePairedComponents(metric, rawInput, labelStrs);
  }

  throw new Error(`Unknown input_structure: ${inputStructure}`);
}

function parseSingleInterval(metric: MetricDef, rawInput: string): ParsedEntry[] {
  const inputValue = parseFloat(rawInput);
  if (Number.isNaN(inputValue)) {
    throw new Error(`Cannot parse single_interval input "${rawInput}" as number`);
  }

  let intervalDistanceM: number | undefined;
  const intervalInfo = extractIntervalFromName(metric.display_name);
  if (intervalInfo) {
    const [, endM] = intervalInfo;
    const [startM] = intervalInfo;
    intervalDistanceM = endM - startM;
  }

  const displayValue = applyConversion(
    inputValue,
    metric.conversion_formula,
    intervalDistanceM
  );

  return [
    {
      metric_key: metric.display_name,
      interval_index: null,
      component: null,
      value: inputValue,
      display_value: displayValue,
      units: metric.display_units,
    },
  ];
}

function parseCumulative(
  metric: MetricDef,
  rawInput: string,
  splits: number[]
): ParsedEntry[] {
  const parts = splitValues(rawInput);
  const cumulativeValues = parts.map((p) => {
    const v = parseFloat(p);
    if (Number.isNaN(v)) throw new Error(`Cannot parse cumulative value "${p}"`);
    return v;
  });

  if (cumulativeValues.length !== splits.length) {
    throw new Error(
      `Cumulative values count (${cumulativeValues.length}) does not match splits (${splits.length}) for ${metric.display_name}`
    );
  }

  const cumulativeDistances = [0];
  let cur = 0;
  for (const s of splits) {
    cur += s;
    cumulativeDistances.push(cur);
  }

  const rows: ParsedEntry[] = [];

  // Cumulative rows (0–5m, 0–10m, etc.)
  for (let i = 0; i < cumulativeValues.length; i++) {
    const val = cumulativeValues[i];
    const endM = cumulativeDistances[i + 1];
    const distM = endM - 0;
    const displayVal = applyConversion(val, metric.conversion_formula, distM);
    rows.push({
      metric_key: metric.display_name,
      interval_index: i,
      component: formatIntervalLabel(0, endM),
      value: val,
      display_value: displayVal,
      units: metric.display_units,
    });
  }

  // Split rows (5–10m, 10–20m, etc.) and velocity rows for non-zero-start splits
  for (let i = 0; i < cumulativeValues.length - 1; i++) {
    const startM = cumulativeDistances[i + 1];
    const endM = cumulativeDistances[i + 2];
    const splitValue = cumulativeValues[i + 1] - cumulativeValues[i];
    const distM = endM - startM;

    const displayVal = applyConversion(
      splitValue,
      metric.conversion_formula,
      distM
    );
    rows.push({
      metric_key: metric.display_name,
      interval_index: i + 1,
      component: formatIntervalLabel(startM, endM),
      value: splitValue,
      display_value: displayVal,
      units: metric.display_units,
    });

    // Velocity row for split (e.g. 5–10m_Split)
    if (startM > 0) {
      const splitMetricKey = `${startM}-${endM}m_Split`;
      const splitMetric = getMetric(splitMetricKey);
      if (splitMetric && splitMetric.conversion_formula === "velocity_mph") {
        const velDisplay = applyConversion(
          splitValue,
          "velocity_mph",
          distM
        );
        rows.push({
          metric_key: splitMetric.display_name,
          interval_index: null,
          component: formatIntervalLabel(startM, endM),
          value: splitValue,
          display_value: velDisplay,
          units: splitMetric.display_units,
        });
      }
    }
  }

  // Additional 10m intervals (non-consecutive)
  for (let i = 1; i < cumulativeDistances.length; i++) {
    for (let j = i + 2; j < cumulativeDistances.length; j++) {
      const startM = cumulativeDistances[i];
      const endM = cumulativeDistances[j];
      const intervalDist = endM - startM;
      if (intervalDist >= 10 && intervalDist % 10 === 0) {
        const splitTime = cumulativeValues[j - 1] - cumulativeValues[i - 1];
        const displayVal = applyConversion(
          splitTime,
          metric.conversion_formula,
          intervalDist
        );
        rows.push({
          metric_key: metric.display_name,
          interval_index: null,
          component: formatIntervalLabel(startM, endM),
          value: splitTime,
          display_value: displayVal,
          units: metric.display_units,
        });

        const splitMetricKey = `${startM}-${endM}m_Split`;
        const splitMetric = getMetric(splitMetricKey);
        if (splitMetric && splitMetric.conversion_formula === "velocity_mph") {
          rows.push({
            metric_key: splitMetric.display_name,
            interval_index: null,
            component: formatIntervalLabel(startM, endM),
            value: splitTime,
            display_value: applyConversion(splitTime, "velocity_mph", intervalDist),
            units: splitMetric.display_units,
          });
        }
      }
    }
  }

  return rows;
}

function parsePairedComponents(
  metric: MetricDef,
  rawInput: string,
  labels: string[]
): ParsedEntry[] {
  const parts = splitValues(rawInput);
  const values = parts.map((p) => {
    const v = parseFloat(p);
    if (Number.isNaN(v)) throw new Error(`Cannot parse component value "${p}"`);
    return v;
  });

  if (values.length !== labels.length) {
    throw new Error(
      `Component values (${values.length}) do not match labels (${labels.length}) for ${metric.display_name}`
    );
  }

  const rows: ParsedEntry[] = [];
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const displayVal = applyConversion(val, metric.conversion_formula);
    rows.push({
      metric_key: metric.display_name,
      interval_index: null,
      component: labels[i],
      value: val,
      display_value: displayVal,
      units: metric.display_units,
    });
  }

  if (values.length === 2) {
    const [l, r] = values;
    const diff = Math.abs(l - r);
    const maxVal = Math.max(l, r);
    const asymmetryPct = maxVal !== 0 ? (diff / maxVal) * 100 : 0;
    rows.push({
      metric_key: metric.display_name,
      interval_index: null,
      component: "L-R",
      value: diff,
      display_value: asymmetryPct,
      units: "%",
    });
  }

  return rows;
}

export function getMetricsRegistry(): Record<string, MetricDef> {
  return metrics;
}
