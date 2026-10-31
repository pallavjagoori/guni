import Link from "next/link";
import { notFound } from "next/navigation";
import { getPaper } from "@/lib/admin/papers";
import { requireAdmin } from "@/lib/auth";
import { ExtractButton } from "./extract-button";

export async function PaperView({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const paper = await getPaper(id);
  if (!paper) notFound();
  const count = paper.sections.reduce((n, s) => n + s.questions.length, 0);

  return (
    <>
      <header className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-zinc-500">
          ← Papers
        </Link>
        <h1 className="text-2xl font-semibold">
          {paper.exam} {paper.subject} {paper.year} {paper.variant}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Status: {paper.status} · {count} questions · {paper.maxMarks} marks · {paper.durationMinutes} minutes
        </p>
      </header>
      <ExtractButton paperId={paper.id} hasQuestions={count > 0} />
      {paper.flags.length > 0 && (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
          <h2 className="font-medium">Needs a look</h2>
          <ul className="list-disc pl-5">
            {paper.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      )}
      {paper.sections.map((s) => (
        <section key={s.id} className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">
            {s.title} · {s.marksCorrect} marks each
          </h2>
          {s.questions.map((q) => (
            <article key={q.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">
                Q{q.label} · {q.kind} · {q.marks ?? s.marksCorrect} marks
                {q.figure && ` · diagram on page ${q.figure.page}`}
              </p>
              <p className="whitespace-pre-wrap">{q.stem}</p>
              {q.options.length > 0 && (
                <ol className="mt-2 flex flex-col gap-1 text-sm">
                  {q.options.map((o) => (
                    <li key={o.label}>
                      ({o.label}) {o.body}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
        </section>
      ))}
    </>
  );
}
