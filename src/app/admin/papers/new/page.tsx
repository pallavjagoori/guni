import { Suspense } from "react";
import { NewPaperSection } from "./new-paper-section";

export default function NewPaperPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Import a paper</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <NewPaperSection />
      </Suspense>
    </main>
  );
}
