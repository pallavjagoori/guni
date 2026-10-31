import Link from "next/link";
import { listPapers } from "@/lib/admin/papers";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "../login/actions";

/** Server component listing every paper with its status. Admins only. */
export async function PaperList() {
  const user = await requireAdmin();
  const papers = await listPapers();
  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span>Signed in as {user.displayName}</span>
        <form action={signOut}>
          <button className="underline">Sign out</button>
        </form>
      </div>
      <Link href="/admin/papers/new" className="self-start rounded-md bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
        Import a paper
      </Link>
      {papers.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">No papers yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {papers.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/papers/${p.id}`} className="flex justify-between rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <span>
                  {p.exam} {p.subject} {p.year} {p.variant}
                </span>
                <span className="text-sm text-zinc-500">{p.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
