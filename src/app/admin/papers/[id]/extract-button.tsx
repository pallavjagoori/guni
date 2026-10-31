"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postStep } from "./post-step";

const call = (paperId: string, body: object) => postStep(`/api/admin/papers/${paperId}/extract`, body);

/**
 * Runs extraction step by step (outline, each section, checks), showing progress and errors.
 * @param props.paperId - The paper to extract.
 * @param props.hasQuestions - Whether questions exist already; the button then reads "Extract again".
 */
export function ExtractButton({ paperId, hasQuestions }: { paperId: string; hasQuestions: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    let cost = 0;
    try {
      setStatus("Reading the paper's instructions…");
      const outline = await call(paperId, { step: "outline" });
      cost += outline.costUsd;
      for (let position = 1; position <= outline.sections; position++) {
        setStatus(`Transcribing section ${position} of ${outline.sections}…`);
        cost += (await call(paperId, { step: "section", position })).costUsd;
      }
      setStatus("Checking the result…");
      const { issues } = await call(paperId, { step: "check" });
      setStatus(
        `Done for $${cost.toFixed(3)}. ${issues.length ? `${issues.length} problem(s) flagged below.` : "No problems found."}`,
      );
      router.refresh();
    } catch (e) {
      setStatus(`Stopped: ${(e as Error).message}`);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={busy}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {hasQuestions ? "Extract again" : "Extract questions"}
      </button>
      {status && <p className="text-sm text-zinc-600 dark:text-zinc-400">{status}</p>}
    </div>
  );
}
