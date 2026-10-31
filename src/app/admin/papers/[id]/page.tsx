import { Suspense } from "react";
import { PaperView } from "./paper-view";

/** Admin page for one paper: its questions, answers, flags and pipeline buttons. */
export default function PaperPage({ params }: PageProps<"/admin/papers/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<p>Loading…</p>}>
        <PaperView params={params} />
      </Suspense>
    </main>
  );
}
