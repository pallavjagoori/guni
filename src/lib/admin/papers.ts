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
    }[];
  }[];
  flags: string[];
}

type DetailRow = Omit<PaperRow, "subject" | "exam"> &
  Joined & {
    source_pdf_path: string | null;
    max_marks: number;
    duration_minutes: number;
    sections: {
      id: string;
      position: number;
      title: string;
      marks_correct: number;
      questions: (PaperDetail["sections"][number]["questions"][number] & { options: { label: string; body: string }[] })[];
    }[];
  };

export async function getPaper(id: string): Promise<PaperDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("papers")
    .select(
      `id, year, variant, status, source_pdf_path, max_marks, duration_minutes,
       subjects!inner(name, exams!inner(name)),
       sections(id, position, title, marks_correct,
         questions(id, position, label, kind, stem, marks, figure, options(label, body)))`,
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
    maxMarks: row.max_marks,
    durationMinutes: row.duration_minutes,
    sections: [...row.sections].sort(byPosition).map((s) => ({
      id: s.id,
      position: s.position,
      title: s.title,
      marksCorrect: s.marks_correct,
      questions: [...s.questions].sort(byPosition).map((q) => ({
        ...q,
        options: [...q.options].sort((a, b) => a.label.localeCompare(b.label)),
      })),
    })),
    flags: (flags as { reason: string }[]).map((f) => f.reason),
  };
}
