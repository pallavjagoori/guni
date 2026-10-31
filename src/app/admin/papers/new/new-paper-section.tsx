import { listSubjects } from "@/lib/admin/papers";
import { requireAdmin } from "@/lib/auth";
import { NewPaperForm } from "./new-paper-form";

/** Server component that loads the subjects and renders the import form. Admins only. */
export async function NewPaperSection() {
  await requireAdmin();
  return <NewPaperForm subjects={await listSubjects()} />;
}
