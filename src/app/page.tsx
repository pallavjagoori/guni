import Link from "next/link";

const tracks = [
  { code: "cbse12", name: "CBSE Class 12", note: "Board PYQs by subject" },
  { code: "jee", name: "JEE Main and Advanced", note: "Coming after the CBSE release" },
  { code: "neet", name: "NEET", note: "Coming after the CBSE release" },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Guni</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Practise past papers, see exactly which concepts need revision, and track mastery over time.
        </p>
      </header>
      <ul className="flex flex-col gap-3">
        {tracks.map((t) => (
          <li key={t.code} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="font-medium">{t.name}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.note}</p>
          </li>
        ))}
      </ul>
      <Link href="/login" className="self-start text-sm underline">
        Sign in
      </Link>
    </main>
  );
}
