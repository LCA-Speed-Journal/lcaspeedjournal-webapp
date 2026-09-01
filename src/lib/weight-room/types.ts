import type { HugoGroup } from "./constants";

export type CardMovement = {
  label: string;
  name: string;
  block: string;
  setCount: number;
  targets: string[];
  notes: string;
  fromPair: boolean;
  exerciseHtml: string | null;
  speedJournalMetricKey: string | null;
  speedJournalComponent?: string | null;
};

export type CardDraft = {
  hugoGroup: HugoGroup;
  weekNumber: number | null;
  dayName: string;
  sessionDate: string;
  focus: string;
  title: string;
  movements: CardMovement[];
};
