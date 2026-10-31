import type { SupabaseClient } from "@supabase/supabase-js";

/** Paths that prepareUpload hands out. Anything else is rejected. */
export const UPLOAD_PATH = /^uploads\/[0-9a-f-]{36}\.pdf$/;

/** Whether a signed upload actually finished. Returns an error message, or null when the file is there. */
export async function missingUpload(db: SupabaseClient, path: string): Promise<string | null> {
  const name = path.slice("uploads/".length);
  const { data, error } = await db.storage.from("papers").list("uploads", { search: name });
  if (error) return error.message;
  return data.some((f) => f.name === name) ? null : "The PDF didn't finish uploading. Try again.";
}
