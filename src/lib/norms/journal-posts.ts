export type JournalMovement = {
  id: string;
  name: string;
  speed_journal_metric_key: string | null;
};

export type CellOutput = {
  movement_id: string;
  kind: string;
  load: number | null;
  units: string | null;
};

export type JournalPostCandidate = {
  movement_id: string;
  metric_key: string | null;
  best_value: number | null;
  units: string | null;
  suggested_post: boolean;
  mapped: boolean;
};

export type JournalPostChoice = {
  movement_id: string;
  metric_key: string;
  post: boolean;
};

export type AppliedJournalPost = {
  movement_id: string;
  metric_key: string;
  best_value: number;
  units: string | null;
};

function isUsableOutput(cell: CellOutput): boolean {
  return cell.kind === "output" && Number.isFinite(cell.load);
}

function pickBestCell(
  cells: CellOutput[],
  lowerIsBetter: boolean
): CellOutput {
  return cells.reduce((best, cell) => {
    const load = cell.load as number;
    const bestLoad = best.load as number;
    if (lowerIsBetter) {
      return load < bestLoad ? cell : best;
    }
    return load > bestLoad ? cell : best;
  });
}

export function buildJournalPostCandidates(input: {
  movements: JournalMovement[];
  outputs: CellOutput[];
  lowerIsBetterFor: (metricKey: string | null) => boolean;
}): JournalPostCandidate[] {
  const rows: JournalPostCandidate[] = [];

  for (const movement of input.movements) {
    const metricKey = movement.speed_journal_metric_key;
    const mapped = Boolean(metricKey);
    const usable = input.outputs.filter(
      (cell) => cell.movement_id === movement.id && isUsableOutput(cell)
    );

    if (usable.length === 0) {
      if (!mapped) continue;
      rows.push({
        movement_id: movement.id,
        metric_key: metricKey,
        best_value: null,
        units: null,
        suggested_post: false,
        mapped: true,
      });
      continue;
    }

    const best = pickBestCell(usable, input.lowerIsBetterFor(metricKey));
    rows.push({
      movement_id: movement.id,
      metric_key: mapped ? metricKey : null,
      best_value: best.load as number,
      units: best.units,
      suggested_post: mapped,
      mapped,
    });
  }

  return rows;
}

export function applyJournalPosts(
  candidates: JournalPostCandidate[],
  posts: JournalPostChoice[]
): AppliedJournalPost[] {
  const byMovement = new Map(
    candidates.map((candidate) => [candidate.movement_id, candidate])
  );
  const posted: AppliedJournalPost[] = [];

  for (const post of posts) {
    if (!post.post) continue;
    const candidate = byMovement.get(post.movement_id);
    if (!candidate) continue;
    if (candidate.best_value == null || !Number.isFinite(candidate.best_value)) {
      continue;
    }
    if (!post.metric_key) continue;
    posted.push({
      movement_id: post.movement_id,
      metric_key: post.metric_key,
      best_value: candidate.best_value,
      units: candidate.units,
    });
  }

  return posted;
}
