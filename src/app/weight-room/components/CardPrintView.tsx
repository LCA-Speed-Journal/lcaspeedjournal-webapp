import { Fragment } from "react";
import "./card-print.css";
import {
  HUGO_GROUP_META,
  printHeaderGroups,
  type HugoGroup,
} from "@/lib/weight-room/constants";
import type { CardDraft, CardMovement } from "@/lib/weight-room/types";

function headerBg(draft: CardDraft): string {
  const blob = `${draft.dayName} ${draft.focus}`.toLowerCase();
  if (blob.includes("upper")) return "#f5a8ae";
  if (blob.includes("lower") || blob.includes("soccer")) return "#9ec5e8";
  if (blob.includes("total") || blob.includes("friday")) return "#c9a8e0";
  if (blob.includes("condition") || blob.includes("wednesday")) return "#8fd4c8";
  return "#d7d7d7";
}

function blockClass(block: string): string {
  const b = block.trim().toLowerCase().replace(/\s+/g, "");
  if (b.startsWith("warmup")) return "wr-block-warmup";
  if (b.startsWith("primer")) return "wr-block-primer";
  if (b.startsWith("main")) return "wr-block-main";
  if (b.startsWith("secondary")) return "wr-block-secondary";
  if (b.startsWith("accessory") || b.startsWith("optional")) return "wr-block-accessory";
  if (b.startsWith("conditioning") || b === "blocka") return "wr-block-conditioning";
  if (b === "blockb") return "wr-block-blockb";
  return "wr-block-main";
}

function targetHtml(target: string): string {
  if (!target || !target.trim()) return "&nbsp;";
  if (target.includes(" @ RPE ")) {
    const [rep, rpe] = target.split(" @ RPE ");
    return `${rep}<br/>@ RPE ${rpe}`;
  }
  if (target.includes(" @ ")) {
    const [rep, rest] = target.split(" @ ");
    return `${rep}<br/>@ ${rest}`;
  }
  return target;
}

function maxSetsOf(draft: CardDraft): number {
  const counts = draft.movements.map((m) => m.setCount).filter((n) => n > 0);
  return counts.length ? Math.max(...counts) : 1;
}

function needsGroupSep(movements: CardMovement[], idx: number): boolean {
  if (idx <= 0) return false;
  const prev = movements[idx - 1];
  const curr = movements[idx];
  if (prev.fromPair && curr.fromPair && prev.block === curr.block) return false;
  return true;
}

function SportChecks({ selected }: { selected: HugoGroup }) {
  return (
    <div className="wr-sports">
      {printHeaderGroups(selected).map((g) => (
        <span key={g} className="wr-check">
          [{g === selected ? "x" : " "}] {HUGO_GROUP_META[g].label}
        </span>
      ))}
    </div>
  );
}

function SetCells({
  mov,
  maxSets,
}: {
  mov: CardMovement;
  maxSets: number;
}) {
  return (
    <>
      {Array.from({ length: maxSets }, (_, s) => {
        const inSet = s < mov.setCount;
        const extra = inSet ? "" : " wr-empty";
        const target = inSet ? (mov.targets[s] ?? "") : "";
        return (
          <Fragment key={s}>
            <td
              className={`wr-target${extra}`}
              dangerouslySetInnerHTML={{
                __html: inSet ? targetHtml(target) : "&nbsp;",
              }}
            />
            <td className={`wr-result${extra}`}>&nbsp;</td>
          </Fragment>
        );
      })}
    </>
  );
}

export function CardPrintView({
  draft,
  templateQrUrl,
}: {
  draft: CardDraft;
  /** Real template QR data URL. Preview catalog omits this and keeps the placeholder. */
  templateQrUrl?: string;
}) {
  const maxSets = maxSetsOf(draft);
  const setColspan = maxSets * 2;

  return (
    <section
      className="wr-sheet"
      style={{ ["--wr-header-bg" as string]: headerBg(draft) }}
    >
      <div className="wr-fiducial wr-fiducial-tl" aria-hidden />
      <div className="wr-fiducial wr-fiducial-bl" aria-hidden />
      <div className="wr-fiducial wr-fiducial-br" aria-hidden />

      <div className="wr-top">
        <div className="wr-top-main">
          <div className="wr-header">
            <div className="wr-header-row">
              {templateQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={templateQrUrl}
                  alt="Template QR"
                  className="wr-qr-placeholder"
                />
              ) : (
                <div
                  className="wr-qr-placeholder"
                  title="Template QR (placeholder)"
                />
              )}
              <h1>{draft.title}</h1>
            </div>
          </div>

          <table className="wr-meta">
            <tbody>
              <tr>
                <td className="wr-athlete">
                  <span className="wr-meta-label">Athlete</span>
                </td>
                <td className="wr-sport-cell">
                  <span className="wr-meta-label">Sport</span>
                  <SportChecks selected={draft.hugoGroup} />
                </td>
                <td className="wr-date">
                  <span className="wr-meta-label">Date</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="wr-sticker-pad">Coach sticker</div>
      </div>

      <table className="wr-table">
        <thead>
          <tr>
            <th className="wr-col-ex" rowSpan={2}>
              Exercise
            </th>
            {Array.from({ length: maxSets }, (_, s) => (
              <th key={s} colSpan={2}>
                Set {s + 1}
              </th>
            ))}
          </tr>
          <tr>
            {Array.from({ length: maxSets }, (_, s) => (
              <Fragment key={s}>
                <th>Reps</th>
                <th>Load×Reps</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.movements.map((mov, idx) => {
            const isWarmup =
              mov.block.toLowerCase() === "warmup" && mov.setCount <= 0;
            const hasNotes = Boolean(mov.notes.trim()) && !isWarmup;
            const labelPrefix = mov.label ? <strong>{mov.label} — </strong> : null;
            const rowClass = needsGroupSep(draft.movements, idx)
              ? "wr-group-sep"
              : "";
            const nameInner = mov.exerciseHtml ? (
              <span dangerouslySetInnerHTML={{ __html: mov.exerciseHtml }} />
            ) : (
              mov.name
            );

            if (isWarmup) {
              return (
                <tr key={`${mov.label}-${idx}`} className={rowClass}>
                  <td className={`wr-ex ${blockClass(mov.block)}`}>
                    {labelPrefix}
                    {mov.name}
                  </td>
                  <td className="wr-warmup-notes" colSpan={setColspan}>
                    {mov.notes}
                  </td>
                </tr>
              );
            }

            return (
              <Fragment key={`${mov.label}-${idx}`}>
                <tr className={rowClass}>
                  <td
                    className={`wr-ex ${blockClass(mov.block)}${hasNotes ? " wr-ex-span" : ""}`}
                    rowSpan={hasNotes ? 2 : 1}
                  >
                    {labelPrefix}
                    {nameInner}
                  </td>
                  <SetCells mov={mov} maxSets={maxSets} />
                </tr>
                {hasNotes ? (
                  <tr className="wr-notes">
                    <td colSpan={setColspan}>{mov.notes}</td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
