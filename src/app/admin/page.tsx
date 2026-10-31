import { Suspense } from "react";
import { PaperList } from "./paper-list";

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <PaperList />
      </Suspense>
    </main>
  );
}
