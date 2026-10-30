// Deterministic paper scoring. No AI here: the same responses always give the same score.

export type QuestionKind =
  | "mcq_single"
  | "mcq_multi"
  | "assertion_reason"
  | "numerical"
  | "descriptive";

export interface SectionRules {
  id: string;
  marksCorrect: number;
  marksWrong: number; // negative for JEE/NEET, e.g. -1
  marksUnattempted: number;
  attemptLimit?: number | null; // "attempt any N": only the first N attempted questions count
}

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

export interface ResponseInput {
  questionId: string;
  selectedLabels?: string[];
  numericalValue?: number | null;
  // Descriptive questions: marks from the rough-work review. An admin override wins.
  estimatedMarks?: number | null;
  adminOverrideMarks?: number | null;
}

export type Outcome = "correct" | "partial" | "wrong" | "unattempted" | "not_counted";

export interface QuestionResult {
  questionId: string;
  outcome: Outcome;
  marks: number;
  estimated: boolean;
}

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

  switch (q.kind) {
    case "mcq_single":
    case "assertion_reason": {
      const correct = q.correctLabels ?? [];
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
      const correct = new Set(q.correctLabels ?? []);
      const selected = new Set(r!.selectedLabels!);
      const anyWrong = [...selected].some((l) => !correct.has(l));
      if (anyWrong) return { ...base, outcome: "wrong", marks: section.marksWrong };
      if (selected.size === correct.size) return { ...base, outcome: "correct", marks: full };
      return { ...base, outcome: "partial", marks: selected.size };
    }

    case "numerical": {
      const answer = q.numericalAnswer;
      if (answer === null || answer === undefined) {
        throw new Error(`Question ${q.id} has no numerical answer`);
      }
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

export function scorePaper(
  sections: SectionRules[],
  questions: ScorableQuestion[],
  responses: ResponseInput[],
): PaperResult {
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const responseById = new Map(responses.map((r) => [r.questionId, r]));
  const ordered = [...questions].sort((a, b) =>
    a.sectionId === b.sectionId ? a.position - b.position : a.sectionId.localeCompare(b.sectionId),
  );

  const results = new Map<string, QuestionResult>();
  const attemptedInSection = new Map<string, number>();

  for (const q of ordered) {
    const section = sectionById.get(q.sectionId);
    if (!section) throw new Error(`Question ${q.id} references unknown section ${q.sectionId}`);
    const r = responseById.get(q.id);
    let result = scoreQuestion(q, section, r);

    if (section.attemptLimit != null && result.outcome !== "unattempted") {
      const n = (attemptedInSection.get(section.id) ?? 0) + 1;
      attemptedInSection.set(section.id, n);
      if (n > section.attemptLimit) {
        result = { questionId: q.id, outcome: "not_counted", marks: 0, estimated: false };
      }
    }
    results.set(q.id, result);
  }

  // CBSE internal choice: within an OR group only the best-scoring alternative counts.
  const groups = new Map<string, ScorableQuestion[]>();
  for (const q of ordered) {
    if (q.internalChoiceGroup) {
      const key = `${q.sectionId}:${q.internalChoiceGroup}`;
      groups.set(key, [...(groups.get(key) ?? []), q]);
    }
  }
  for (const members of groups.values()) {
    const best = members.reduce((a, b) => (results.get(b.id)!.marks > results.get(a.id)!.marks ? b : a));
    for (const m of members) {
      if (m.id !== best.id) {
        results.set(m.id, { questionId: m.id, outcome: "not_counted", marks: 0, estimated: false });
      }
    }
  }

  const list = ordered.map((q) => results.get(q.id)!);
  const total = list.reduce((sum, r) => sum + r.marks, 0);
  const estimated = list.some((r) => r.estimated && r.outcome !== "not_counted");
  return { total, estimated, questions: list };
}
