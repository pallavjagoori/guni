"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { prepareUpload } from "../new/actions";
import { attachMarkingScheme } from "./actions";
import { postStep } from "./post-step";

/** Lets an admin attach the official marking scheme PDF and read answer keys from it, section by section. */
export function KeysPanel({
  paperId,
  sections,
  hasScheme,
}: {
  paperId: string;
  sections: number[]; // section positions
  hasScheme: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      setStatus("Uploading the marking scheme…");
      const target = await prepareUpload();
      if ("error" in target) throw new Error(target.error);
      const { error } = await createClient()
        .storage.from("papers")
        .uploadToSignedUrl(target.path, target.token, file, { contentType: "application/pdf" });
      if (error) throw new Error(error.message);
      const attached = await attachMarkingScheme({ paperId, path: target.path });
      if ("error" in attached) throw new Error(attached.error);
      setStatus("Marking scheme uploaded.");
      router.refresh();
    } catch (e) {
      setStatus(`Stopped: ${(e as Error).message}`);
    }
    // Lets the same file be chosen again after a failure.
    input.value = "";
    setBusy(false);
  }

  async function readKeys() {
    setBusy(true);
    let cost = 0;
    const url = `/api/admin/papers/${paperId}/keys`;
    try {
      for (const [i, position] of sections.entries()) {
        setStatus(`Reading answers for section ${i + 1} of ${sections.length}…`);
        cost += (await postStep(url, { step: "section", position })).costUsd;
      }
      setStatus("Checking the answers…");
      const { issues } = await postStep(url, { step: "check" });
      setStatus(
        `Done for $${cost.toFixed(3)}. ${issues.length ? `${issues.length} problem(s) flagged below.` : "Every question has an answer."}`,
      );
      router.refresh();
    } catch (e) {
      setStatus(`Stopped: ${(e as Error).message}`);
    }
    setBusy(false);
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-medium">Answer keys</h2>
      <label className="flex flex-col gap-1 text-sm">
        {hasScheme ? "Replace the marking scheme PDF" : "Upload the official marking scheme PDF"}
        <input type="file" accept="application/pdf" onChange={upload} disabled={busy} />
      </label>
      {hasScheme && sections.length > 0 && (
        <button
          onClick={readKeys}
          disabled={busy}
          className="self-start rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Read answer keys
        </button>
      )}
      {status && <p className="text-sm text-zinc-600 dark:text-zinc-400">{status}</p>}
    </section>
  );
}
