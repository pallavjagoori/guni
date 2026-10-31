import "server-only";
import { createClient } from "@/lib/supabase/server";

// Admin reads go through the signed-in user's client, so row level security still
// requires an admin profile even if a page forgets its check.

export interface PaperRow {
  id: string;
  year: number;
  variant: string;
  status: string;
  subject: string;
  exam: string;
}

type Joined = { subjects: { name: string; exams: { name: string } } };

export async function listPapers(): Promise<PaperRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("papers")
    .select("id, year, variant, status, subjects!inner(name, exams!inner(name))")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as (Omit<PaperRow, "subject" | "exam"> & Joined)[]).map(({ subjects, ...p }) => ({
    ...p,
    subject: subjects.name,
    exam: subjects.exams.name,
  }));
}

export interface SubjectOption {
  id: string;
  label: string;
}

export async function listSubjects(): Promise<SubjectOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, exams!inner(name)")
    .order("name");
  if (error) throw new Error(error.message);
  return (data as unknown as { id: string; name: string; exams: { name: string } }[])
    .map((s) => ({ id: s.id, label: `${s.exams.name} · ${s.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface PaperDetail extends PaperRow {
  sourcePdfPath: string | null;
  markingSchemePdfPath: string | null;
  maxMarks: number;
  durationMinutes: number;
  sections: {
    id: string;
    position: number;
    title: string;
    marksCorrect: number;
    questions: {
      id: string;
      position: number;
      label: string;
      kind: string;
      stem: string;
      marks: number | null;
      figure: { page: number; caption: string } | null;
      options: { label: string; body: string }[];
      answer: string | null; // official key: "B", "A, C" or a number
      steps: { n: number; text: string; marks: number }[]; // marking-scheme value points
    }[];
  }[];
  flags: string[];
}

type KeyRow = { correct_labels: string[]; numerical_answer: number | null };
type StoredQuestion = Omit<PaperDetail["sections"][number]["questions"][number], "answer" | "steps"> & {
  // One-to-one embeds come back as an object; be tolerant of an array too.
  answer_keys: KeyRow | KeyRow[] | null;
  solutions: { source: string; steps: { n: number; text: string; marks: number }[] }[];
};

type DetailRow = Omit<PaperRow, "subject" | "exam"> &
  Joined & {
    source_pdf_path: string | null;
    marking_scheme_pdf_path: string | null;
    max_marks: number;
    duration_minutes: number;
    sections: {
      id: string;
      position: number;
      title: string;
      marks_correct: number;
      questions: StoredQuestion[];
    }[];
  };

export async function getPaper(id: string): Promise<PaperDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("papers")
    .select(
      `id, year, variant, status, source_pdf_path, marking_scheme_pdf_path, max_marks, duration_minutes,
       subjects!inner(name, exams!inner(name)),
       sections(id, position, title, marks_correct,
         questions(id, position, label, kind, stem, marks, figure, options(label, body),
           answer_keys(correct_labels, numerical_answer), solutions(source, steps)))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as DetailRow;
  const { data: flags, error: flagError } = await supabase
    .from("review_flags")
    .select("reason")
    .eq("entity", "paper")
    .eq("entity_id", id)
    .eq("resolved", false)
    .order("created_at");
  if (flagError) throw new Error(flagError.message);

  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  return {
    id: row.id,
    year: row.year,
    variant: row.variant,
    status: row.status,
    subject: row.subjects.name,
    exam: row.subjects.exams.name,
    sourcePdfPath: row.source_pdf_path,
    markingSchemePdfPath: row.marking_scheme_pdf_path,
    maxMarks: row.max_marks,
    durationMinutes: row.duration_minutes,
    sections: [...row.sections].sort(byPosition).map((s) => ({
      id: s.id,
      position: s.position,
      title: s.title,
      marksCorrect: s.marks_correct,
      questions: [...s.questions].sort(byPosition).map(({ answer_keys, solutions, ...q }) => ({
        ...q,
        options: [...q.options].sort((a, b) => a.label.localeCompare(b.label)),
        answer: formatKey(Array.isArray(answer_keys) ? answer_keys[0] : answer_keys),
        steps: solutions.find((x) => x.source === "marking_scheme")?.steps ?? [],
      })),
    })),
    flags: (flags as { reason: string }[]).map((f) => f.reason),
  };
}

function formatKey(key: KeyRow | null | undefined): string | null {
  if (!key) return null;
  if (key.numerical_answer != null) return String(key.numerical_answer);
  return key.correct_labels.length ? key.correct_labels.join(", ") : null;
}
