import { Suspense } from "react";
import { SetupGate } from "./setup-gate";

/** One-time page to create the first admin account. */
export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Set up Guni</h1>
      <Suspense fallback={<p>Checking…</p>}>
        <SetupGate />
      </Suspense>
    </main>
  );
}
