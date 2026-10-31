"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

const input = z.object({
  paperId: z.uuid(),
  path: z.string().regex(/^uploads\/[0-9a-f-]{36}\.pdf$/),
});

// Links an uploaded marking scheme PDF (see prepareUpload) to its paper.
export async function attachMarkingScheme(raw: z.input<typeof input>): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: "Choose a PDF." };
  const { paperId, path } = parsed.data;

  const db = createAdminClient();
  const name = path.slice("uploads/".length);
  const { data: files, error: listError } = await db.storage.from("papers").list("uploads", { search: name });
  if (listError) return { error: listError.message };
  if (!files.some((f) => f.name === name)) return { error: "The PDF didn't finish uploading. Try again." };

  const { error } = await db.from("papers").update({ marking_scheme_pdf_path: path }).eq("id", paperId);
  if (error) return { error: error.message };
  return { ok: true };
}
