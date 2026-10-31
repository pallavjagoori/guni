"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { UPLOAD_PATH, missingUpload } from "@/lib/admin/uploads";
import { createAdminClient } from "@/lib/supabase/server";

const input = z.object({
  paperId: z.uuid(),
  path: z.string().regex(UPLOAD_PATH),
});

/** Links an uploaded marking scheme PDF (see prepareUpload) to its paper. */
export async function attachMarkingScheme(raw: z.input<typeof input>): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: "Choose a PDF." };
  const { paperId, path } = parsed.data;

  const db = createAdminClient();
  const missing = await missingUpload(db, path);
  if (missing) return { error: missing };

  const { data, error } = await db.from("papers").update({ marking_scheme_pdf_path: path }).eq("id", paperId).select("id");
  if (error) return { error: error.message };
  if (data.length === 0) return { error: "Paper not found." };
  return { ok: true };
}
