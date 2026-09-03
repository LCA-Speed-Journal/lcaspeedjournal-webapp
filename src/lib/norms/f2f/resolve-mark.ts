import { mphFromYardSplit, yardsInFortyComponent } from "../forty-yd";
import { interpolatePredicted40, type LookupHit } from "./lookup";
import { formMphPoints, forceMphPoints, broadPoints, type FormSplit } from "./tables";

export type ForceMark = {
  timeS?: number;
  yards?: number;
  mph?: number;
};

export type FormMark = {
  component: string;
  timeS?: number;
  yards?: number;
  mph?: number;
};

export type FormHit = LookupHit & { table: string };

const FORM_SPLITS = new Set<FormSplit>(["20-40yd", "20-30yd", "30-40yd"]);

function isFormSplit(component: string): component is FormSplit {
  return FORM_SPLITS.has(component as FormSplit);
}

function markMph(mark: { mph?: number; timeS?: number; yards?: number }): number | null {
  if (mark.mph != null) {
    return Number.isFinite(mark.mph) ? mark.mph : null;
  }
  if (mark.timeS == null || mark.yards == null) return null;
  return mphFromYardSplit(mark.timeS, mark.yards);
}

export function resolveExplosion(feet: number): LookupHit | null {
  if (!Number.isFinite(feet)) return null;
  return interpolatePredicted40(broadPoints(), feet);
}

export function resolveForce(mark: ForceMark): LookupHit | null {
  const mph = markMph(mark);
  if (mph == null) return null;
  return interpolatePredicted40(forceMphPoints(), mph);
}

export function resolveForm(mark: FormMark): FormHit | null {
  const exact = isFormSplit(mark.component) ? mark.component : undefined;
  const yards = mark.yards ?? yardsInFortyComponent(mark.component) ?? undefined;
  const mph = markMph({ mph: mark.mph, timeS: mark.timeS, yards });
  if (mph == null) return null;
  const hit = interpolatePredicted40(formMphPoints(exact), mph);
  if (!hit) return null;
  return { ...hit, table: exact ?? "form" };
}
