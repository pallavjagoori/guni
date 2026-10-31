// Loads the questions a marking scheme must answer, and saves the answers it gives.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KeyAnswer, KeyTarget } from "./keys";
import { must, parseLabel } from "./save";

type Row = {
  id: string;
  label: string;
  kind: KeyTarget["kind"];
  stem: string;
  marks: number | null;
  options: { label: string }[];
};

// Questions of one section (or every section when position is omitted), as key targets.
export async function loadTargets(db: SupabaseClient, paperId: string, position?: number): Promise<KeyTarget[]> {
  let query = db
    .from("sections")
    .select("position, marks_correct, questions(id, label, kind, stem, marks, options(label))")
    .eq("paper_id", paperId);
  if (position !== undefined) query = query.eq("position", position);
  const sections = must(await query) as { position: number; marks_correct: number; questions: Row[] }[];
  return [...sections]
    .sort((a, b) => a.position - b.position)
    .flatMap((s) =>
      s.questions.map((q) => {
        return {
          id: q.id,
          label: q.label,
          ...parseLabel(q.label),
          kind: q.kind,
          marks: Number(q.marks ?? s.marks_correct),
          stem: q.stem,
          optionLabels: q.options.map((o) => o.label).sort(),
        };
      }),
    )
    .sort((a, b) => a.number - b.number || a.alternative - b.alternative);
}

// "(b)" -> "B": the scheme's way of printing a label, normalised to the question's.
const normalise = (label: string) => label.replace(/[()\s.]/g, "").toUpperCase();

// Replaces the official keys and marking-scheme solutions of these questions. Keys an admin
// set by hand are kept. Questions whose label can't be matched (number 0) are skipped.
export async function saveKeys(db: SupabaseClient, allTargets: KeyTarget[], answers: KeyAnswer[]) {
  const targets = allTargets.filter((t) => t.number > 0);
  const ids = targets.map((t) => t.id);
  if (ids.length === 0) return;
  must(await db.from("answer_keys").delete().eq("source", "official").in("question_id", ids));
  must(await db.from("solutions").delete().eq("source", "marking_scheme").in("question_id", ids));

  const byKey = new Map(answers.map((a) => [`${a.number}/${a.alternative}`, a]));
  const keys = [];
  const solutions = [];
  for (const t of targets) {
    const a = byKey.get(`${t.number}/${t.alternative}`);
    if (!a) continue;
    if (t.kind === "numerical" && a.numericalAnswer != null) {
      keys.push({ question_id: t.id, numerical_answer: a.numericalAnswer, numerical_tolerance: a.numericalTolerance ?? 0 });
    } else if (t.kind !== "descriptive" && t.kind !== "numerical") {
      // Only labels the question really has; anything else would mark every student wrong.
      const labels = [...new Set(a.correctLabels.map(normalise))].filter((l) => t.optionLabels.includes(l)).sort();
      if (labels.length) keys.push({ question_id: t.id, correct_labels: labels });
    }
    if (a.steps.length) {
      solutions.push({
        question_id: t.id,
        source: "marking_scheme",
        steps: a.steps.map((s, i) => ({ n: i + 1, text: s.text, marks: s.marks })),
      });
    }
  }
  if (keys.length) {
    must(
      await db
        .from("answer_keys")
        .upsert(keys.map((k) => ({ ...k, source: "official" })), { onConflict: "question_id", ignoreDuplicates: true }),
    );
  }
  if (solutions.length) must(await db.from("solutions").insert(solutions));
}

// Saved keys and marking-scheme steps, in the shape checkKeys expects.
export async function loadAnswers(db: SupabaseClient, targets: KeyTarget[]): Promise<KeyAnswer[]> {
  const ids = targets.map((t) => t.id);
  if (ids.length === 0) return [];
  const keys = must(
    await db.from("answer_keys").select("question_id, correct_labels, numerical_answer, numerical_tolerance").in("question_id", ids),
  ) as { question_id: string; correct_labels: string[]; numerical_answer: number | null; numerical_tolerance: number }[];
  const solutions = must(
    await db.from("solutions").select("question_id, steps").eq("source", "marking_scheme").in("question_id", ids),
  ) as { question_id: string; steps: { text: string; marks: number }[] }[];
  const keyOf = new Map(keys.map((k) => [k.question_id, k]));
  const stepsOf = new Map(solutions.map((s) => [s.question_id, s.steps]));
  return targets
    .filter((t) => keyOf.has(t.id) || stepsOf.has(t.id))
    .map((t) => {
      const k = keyOf.get(t.id);
      return {
        number: t.number,
        alternative: t.alternative,
        correctLabels: k?.correct_labels ?? [],
        numericalAnswer: k?.numerical_answer == null ? null : Number(k.numerical_answer),
        numericalTolerance: k ? Number(k.numerical_tolerance) : null,
        steps: (stepsOf.get(t.id) ?? []).map((s) => ({ text: s.text, marks: Number(s.marks) })),
      };
    });
}
