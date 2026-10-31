import { listSubjects } from "@/lib/admin/papers";
import { requireAdmin } from "@/lib/auth";
import { NewPaperForm } from "./new-paper-form";

export async function NewPaperSection() {
  await requireAdmin();
  return <NewPaperForm subjects={await listSubjects()} />;
}
