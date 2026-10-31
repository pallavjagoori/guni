// Writes pipeline results with the service role. Re-running a step replaces its earlier output.
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalisePart, type ExtractedQuestion, type Outline, type RunResult } from "./extract";

type Result<T> = { data: T; error: { message: string } | null };

/**
 * Unwraps a Supabase result.
 * @throws The database error, if any.
 */
export function must<T>({ data, error }: Result<T>): T {
  if (error) throw new Error(error.message);
  return data;
}

/**
 * The label saveSection writes: "23", "23 (OR 1)", and for case-study parts "29 (III)" and
 * "29 (III) (OR 1)". Also the key that matches a marking-scheme answer to its question.
 */
export function questionLabel(q: { number: number; part: string; alternative: number }) {
  const part = normalisePart(q.part);
  return `${q.number}${part ? ` (${part})` : ""}${q.alternative > 1 ? ` (OR ${q.alternative - 1})` : ""}`;
}

/** Reverses questionLabel. Any other label (edited by hand) becomes question 0, which the checks report. */
export function parseLabel(label: string): { number: number; part: string; alternative: number } {
  const [, number = "0", part = "", or] = /^(\d+)(?: \(([^()\s]+)\))?(?: \(OR (\d+)\))?$/.exec(label) ?? [];
  return { number: Number(number), part, alternative: or ? Number(or) + 1 : 1 };
}

/**
 * Records one AI call's model, prompt version, tokens and cost.
 * @returns The run's id.
 */
export async function logRun(db: SupabaseClient, job: string, promptVersion: string, run: RunResult<unknown>) {
  const row = must(
    await db
      .from("ai_runs")
      .insert({
        job,
        model: run.model,
        prompt_version: promptVersion,
        input_tokens:
          run.usage.input_tokens + (run.usage.cache_creation_input_tokens ?? 0) + (run.usage.cache_read_input_tokens ?? 0),
        output_tokens: run.usage.output_tokens,
        cost_usd: run.costUsd,
      })
      .select("id")
      .single(),
  );
  return (row as { id: string }).id;
}

/** Saves the paper's duration and marks and replaces its sections with the outline's. */
export async function saveOutline(db: SupabaseClient, paperId: string, outline: Outline) {
  must(
    await db
      .from("papers")
      .update({ duration_minutes: outline.durationMinutes, max_marks: outline.maxMarks })
      .eq("id", paperId),
  );
  must(await db.from("sections").delete().eq("paper_id", paperId));
  must(
    await db.from("sections").insert(
      outline.sections.map((s, i) => ({
        paper_id: paperId,
        position: i + 1,
        title: s.title,
        instructions: s.instructions,
        marks_correct: s.marksEach,
        first_question: s.firstQuestion,
        last_question: s.lastQuestion,
        objective: s.objective,
      })),
    ),
  );
}

/** Replaces one section's questions and options with a new transcription, in printed order. */
export async function saveSection(db: SupabaseClient, paperId: string, position: number, questions: ExtractedQuestion[]) {
  const section = must(
    await db.from("sections").select("id").eq("paper_id", paperId).eq("position", position).single(),
  ) as { id: string };
  must(await db.from("questions").delete().eq("section_id", section.id));
  if (questions.length === 0) return;

  // Parts keep the order they were printed in; "OR" alternatives share a group per part.
  const key = (q: ExtractedQuestion) => `${q.number}/${normalisePart(q.part)}`;
  const printed = new Map<string, number>();
  const versions = new Map<string, number>();
  for (const q of questions) {
    if (!printed.has(key(q))) printed.set(key(q), printed.size);
    versions.set(key(q), (versions.get(key(q)) ?? 0) + 1);
  }
  const ordered = [...questions].sort(
    (a, b) => a.number - b.number || printed.get(key(a))! - printed.get(key(b))! || a.alternative - b.alternative,
  );

  const rows = ordered.map((q, i) => {
    const hasChoice = versions.get(key(q))! > 1;
    const part = normalisePart(q.part);
    return {
      section_id: section.id,
      position: i + 1,
      label: questionLabel(q),
      kind: q.kind,
      stem: q.stem,
      marks: q.marks,
      internal_choice_group: hasChoice ? `q${q.number}${part ? `-${part}` : ""}` : null,
      figure: q.figure,
    };
  });
  const saved = must(await db.from("questions").insert(rows).select("id, position")) as { id: string; position: number }[];
  const idAt = new Map(saved.map((r) => [r.position, r.id]));
  const options = ordered.flatMap((q, i) =>
    q.options.map((o) => ({ question_id: idAt.get(i + 1)!, label: o.label, body: o.body })),
  );
  if (options.length) must(await db.from("options").insert(options));
}

/** Prefix of the review flags the extraction check raises. */
export const FLAG_PREFIX = "Extraction: ";

/**
 * Replaces the paper's open flags from one pipeline step (by prefix) with its latest check
 * results. Flags from admins or other steps are left alone.
 */
export async function flagPaper(db: SupabaseClient, paperId: string, issues: string[], prefix = FLAG_PREFIX) {
  must(
    await db
      .from("review_flags")
      .delete()
      .eq("entity", "paper")
      .eq("entity_id", paperId)
      .eq("resolved", false)
      .like("reason", `${prefix}%`),
  );
  if (issues.length) {
    must(
      await db
        .from("review_flags")
        .insert(issues.map((issue) => ({ entity: "paper", entity_id: paperId, reason: prefix + issue }))),
    );
  }
}

type StoredSection = {
  position: number;
  title: string;
  instructions: string | null;
  marks_correct: number;
  first_question: number;
  last_question: number;
  objective: boolean;
  questions: { label: string; kind: ExtractedQuestion["kind"]; stem: string; marks: number | null; figure: ExtractedQuestion["figure"]; options: { label: string; body: string }[] }[];
};

/** Reads a paper's saved extraction back in the shape the checks expect. */
export async function loadExtraction(
  db: SupabaseClient,
  paperId: string,
): Promise<{ outline: Outline; questions: ExtractedQuestion[] }> {
  const paper = must(
    await db
      .from("papers")
      .select(
        "max_marks, duration_minutes, sections(position, title, instructions, marks_correct, first_question, last_question, objective, questions(label, kind, stem, marks, figure, options(label, body)))",
      )
      .eq("id", paperId)
      .single(),
  ) as { max_marks: number; duration_minutes: number; sections: StoredSection[] };
  const sections = [...paper.sections].sort((a, b) => a.position - b.position);
  const outline: Outline = {
    totalQuestions: Math.max(0, ...sections.map((s) => s.last_question)),
    maxMarks: Number(paper.max_marks),
    durationMinutes: paper.duration_minutes,
    sections: sections.map((s) => ({
      title: s.title,
      firstQuestion: s.first_question,
      lastQuestion: s.last_question,
      marksEach: Number(s.marks_correct),
      objective: s.objective,
      instructions: s.instructions ?? "",
    })),
  };
  const questions = sections.flatMap((s) =>
    s.questions.map((q) => {
      return {
        ...parseLabel(q.label),
        kind: q.kind,
        stem: q.stem,
        marks: Number(q.marks ?? s.marks_correct),
        options: [...q.options].sort((a, b) => a.label.localeCompare(b.label)),
        figure: q.figure,
      };
    }),
  );
  return { outline, questions };
}
