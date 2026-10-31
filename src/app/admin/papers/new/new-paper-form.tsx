"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SubjectOption } from "@/lib/admin/papers";
import { createPaper, prepareUpload } from "./actions";

const input = "rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";

/** Form to import a paper: pick subject, year and set, upload the PDF straight to storage, then create the paper. */
export function NewPaperForm({ subjects }: { subjects: SubjectOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("pdf") as File;
    setBusy(true);
    setError(undefined);
    try {
      const upload = await prepareUpload();
      if ("error" in upload) throw new Error(upload.error);
      const { error: uploadError } = await createClient()
        .storage.from("papers")
        .uploadToSignedUrl(upload.path, upload.token, file, { contentType: "application/pdf" });
      if (uploadError) throw new Error(uploadError.message);
      const paper = await createPaper({
        subjectId: String(form.get("subject")),
        year: Number(form.get("year")),
        variant: String(form.get("variant")),
        path: upload.path,
      });
      if ("error" in paper) throw new Error(paper.error);
      router.push(`/admin/papers/${paper.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Subject
        <select name="subject" required className={input}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Year
        <input name="year" type="number" min={2000} max={2100} required className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Set or shift, as printed (for example 55/1/1)
        <input name="variant" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Question paper PDF
        <input name="pdf" type="file" accept="application/pdf" required />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? "Uploading…" : "Upload paper"}
      </button>
    </form>
  );
}
