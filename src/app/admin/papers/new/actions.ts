"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

// PDFs go straight from the browser to storage with a one-time signed URL, because
// server actions only accept small request bodies.
export async function prepareUpload(): Promise<{ path: string; token: string } | { error: string }> {
  await requireAdmin();
  const path = `uploads/${randomUUID()}.pdf`;
  const { data, error } = await createAdminClient().storage.from("papers").createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path, token: data.token };
}

const newPaper = z.object({
  subjectId: z.uuid(),
  year: z.number().int().min(2000).max(2100),
  variant: z.string().trim().max(60),
  path: z.string().regex(/^uploads\/[0-9a-f-]{36}\.pdf$/),
});

export async function createPaper(input: z.input<typeof newPaper>): Promise<{ id: string } | { error: string }> {
  await requireAdmin();
  const parsed = newPaper.safeParse(input);
  if (!parsed.success) return { error: "Choose a subject, a year and a PDF." };
  const { subjectId, year, variant, path } = parsed.data;

  const db = createAdminClient();
  const name = path.slice("uploads/".length);
  const { data: files, error: listError } = await db.storage.from("papers").list("uploads", { search: name });
  if (listError) return { error: listError.message };
  if (!files.some((f) => f.name === name)) return { error: "The PDF didn't finish uploading. Try again." };

  // Duration and marks are placeholders until extraction reads them from the paper.
  const { data, error } = await db
    .from("papers")
    .insert({ subject_id: subjectId, year, variant, duration_minutes: 0, max_marks: 0, source_pdf_path: path })
    .select("id")
    .single();
  if (error) {
    await db.storage.from("papers").remove([path]);
    return { error: error.code === "23505" ? "This paper is already imported." : error.message };
  }
  return { id: data.id };
}
