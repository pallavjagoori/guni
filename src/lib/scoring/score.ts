// Deterministic paper scoring. No AI here: the same responses always give the same score.

/** How a question is answered and scored. */
export type QuestionKind =
  | "mcq_single"
  | "mcq_multi"
  | "assertion_reason"
  | "numerical"
  | "descriptive";

/** How a section awards marks. */
export interface SectionRules {
  id: string;
  position: number; // order in the paper
  marksCorrect: number;
  marksWrong: number; // negative for JEE/NEET, e.g. -1
  marksUnattempted: number;
  attemptLimit?: number | null; // "attempt any N": only the first N attempted questions count
}

/** A question with what scoring needs: its key and how it is marked. */
export interface ScorableQuestion {
  id: string;
  sectionId: string;
  position: number;
  kind: QuestionKind;
  marks?: number | null; // overrides section marks (CBSE descriptive questions)
  correctLabels?: string[]; // objective questions
  numericalAnswer?: number | null;
  numericalTolerance?: number | null;
  internalChoiceGroup?: string | null; // CBSE "OR" alternatives: only the best one counts
}

/** A student's answer to one question. */
export interface ResponseInput {
  questionId: string;
  selectedLabels?: string[];
  numericalValue?: number | null;
  // Descriptive questions: marks from the rough-work review. An admin override wins.
  estimatedMarks?: number | null;
  adminOverrideMarks?: number | null;
}

/**
 * "no_key": the answer key is missing (pending or dropped), so the question earns 0
 * and is listed for an admin instead of failing the whole paper.
 */
export type Outcome = "correct" | "partial" | "wrong" | "unattempted" | "not_counted" | "no_key";

/** One question's outcome and marks. */
export interface QuestionResult {
  questionId: string;
  outcome: Outcome;
  marks: number;
  estimated: boolean;
}

/** A scored attempt. */
export interface PaperResult {
  total: number;
  estimated: boolean; // true if any counted marks are AI estimates
  questions: QuestionResult[];
}

function isAttempted(q: ScorableQuestion, r: ResponseInput | undefined): boolean {
  if (!r) return false;
  switch (q.kind) {
    case "numerical":
      return r.numericalValue !== null && r.numericalValue !== undefined;
    case "descriptive":
      return r.adminOverrideMarks != null || r.estimatedMarks != null;
    default:
      return (r.selectedLabels?.length ?? 0) > 0;
  }
}

function hasKey(q: ScorableQuestion): boolean {
  return q.kind === "numerical"
    ? q.numericalAnswer !== null && q.numericalAnswer !== undefined
    : (q.correctLabels?.length ?? 0) > 0;
}

/** Scores one question under its section's rules. Questions without a key earn 0 and are reported as no_key. */
export function scoreQuestion(
  q: ScorableQuestion,
  section: SectionRules,
  r: ResponseInput | undefined,
): QuestionResult {
  const full = q.marks ?? section.marksCorrect;
  const base = { questionId: q.id, estimated: false };

  if (!isAttempted(q, r)) {
    return { ...base, outcome: "unattempted", marks: section.marksUnattempted };
  }
  // Never guess when a key is missing: a pending key must not cost students marks.
  if (q.kind !== "descriptive" && !hasKey(q)) {
    return { ...base, outcome: "no_key", marks: 0 };
  }

  switch (q.kind) {
    case "mcq_single":
    case "assertion_reason": {
      const correct = q.correctLabels!;
      const selected = r!.selectedLabels!;
      // Some official keys accept more than one option (bonus/dropped questions).
      const ok = selected.length === 1 && correct.includes(selected[0]);
      return ok
        ? { ...base, outcome: "correct", marks: full }
        : { ...base, outcome: "wrong", marks: section.marksWrong };
    }

    case "mcq_multi": {
      // JEE Advanced partial marking: full marks if exactly the correct set is chosen,
      // +1 per correct option if only correct options are chosen, otherwise negative.
      const correct = new Set(q.correctLabels!);
      const selected = new Set(r!.selectedLabels!);
      const anyWrong = [...selected].some((l) => !correct.has(l));
      if (anyWrong) return { ...base, outcome: "wrong", marks: section.marksWrong };
      if (selected.size === correct.size) return { ...base, outcome: "correct", marks: full };
      return { ...base, outcome: "partial", marks: selected.size };
    }

    case "numerical": {
      const answer = q.numericalAnswer!;
      const tol = q.numericalTolerance ?? 0;
      const ok = Math.abs(r!.numericalValue! - answer) <= tol + 1e-9;
      return ok
        ? { ...base, outcome: "correct", marks: full }
        : { ...base, outcome: "wrong", marks: section.marksWrong };
    }

    case "descriptive": {
      const override = r!.adminOverrideMarks;
      const raw = override ?? r!.estimatedMarks!;
      const marks = Math.min(Math.max(raw, 0), full);
      const outcome: Outcome = marks === full ? "correct" : marks === 0 ? "wrong" : "partial";
      return { questionId: q.id, outcome, marks, estimated: override == null };
    }
  }
}

/**
 * Scores a whole attempt: applies each section's rules, counts an OR group once (its best alternative)
 * and respects "attempt any N" limits.
 */
export function scorePaper(
  sections: SectionRules[],
  questions: ScorableQuestion[],
  responses: ResponseInput[],
): PaperResult {
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const responseById = new Map(responses.map((r) => [r.questionId, r]));
  for (const q of questions) {
    if (!sectionById.has(q.sectionId)) {
      throw new Error(`Question ${q.id} references unknown section ${q.sectionId}`);
    }
  }
  const sectionOf = (q: ScorableQuestion) => sectionById.get(q.sectionId)!;
  const ordered = [...questions].sort(
    (a, b) => sectionOf(a).position - sectionOf(b).position || a.position - b.position,
  );

  const results = new Map<string, QuestionResult>();
  for (const q of ordered) results.set(q.id, scoreQuestion(q, sectionOf(q), responseById.get(q.id)));

  const notCounted = (id: string): QuestionResult => ({ questionId: id, outcome: "not_counted", marks: 0, estimated: false });

  // CBSE internal choice: an OR group counts once. Keep the best attempted alternative
  // (the first one on a tie); if none was attempted, keep the first as unattempted.
  const groups = new Map<string, ScorableQuestion[]>();
  for (const q of ordered) {
    if (q.internalChoiceGroup) {
      const key = `${q.sectionId}:${q.internalChoiceGroup}`;
      groups.set(key, [...(groups.get(key) ?? []), q]);
    }
  }
  for (const members of groups.values()) {
    const attempted = members.filter((m) => results.get(m.id)!.outcome !== "unattempted");
    const keep = attempted.length
      ? attempted.reduce((a, b) => (results.get(b.id)!.marks > results.get(a.id)!.marks ? b : a))
      : members[0];
    for (const m of members) if (m.id !== keep.id) results.set(m.id, notCounted(m.id));
  }

  // "Attempt any N": only the first N attempted questions count, after OR groups collapse.
  const attemptedInSection = new Map<string, number>();
  for (const q of ordered) {
    const limit = sectionOf(q).attemptLimit;
    const outcome = results.get(q.id)!.outcome;
    if (limit == null || outcome === "unattempted" || outcome === "not_counted") continue;
    const n = (attemptedInSection.get(q.sectionId) ?? 0) + 1;
    attemptedInSection.set(q.sectionId, n);
    if (n > limit) results.set(q.id, notCounted(q.id));
  }

  const list = ordered.map((q) => results.get(q.id)!);
  const total = list.reduce((sum, r) => sum + r.marks, 0);
  const estimated = list.some((r) => r.estimated);
  return { total, estimated, questions: list };
}
