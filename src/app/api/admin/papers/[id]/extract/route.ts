import { z } from "zod";
import { anthropic } from "@/lib/ai/client";
import { getCurrentUser } from "@/lib/auth";
import { PROMPT_VERSION, checkExtraction, extractOutline, extractSection } from "@/lib/import/extract";
import { flagPaper, loadExtraction, logRun, saveOutline, saveSection } from "@/lib/import/save";
import { createAdminClient } from "@/lib/supabase/server";

// One AI call per request, so each stays well inside the function time limit.
// The admin page calls: outline, then each section, then check.
export const maxDuration = 300;

const EXTRACTABLE = new Set(["collected", "extracted"]);

const step = z.discriminatedUnion("step", [
  z.object({ step: z.literal("outline") }),
  z.object({ step: z.literal("section"), position: z.number().int().min(1) }),
  z.object({ step: z.literal("check") }),
]);

export async function POST(request: Request, ctx: RouteContext<"/api/admin/papers/[id]/extract">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });

  const parsed = step.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unknown step." }, { status: 400 });
  const { id } = await ctx.params;
  const db = createAdminClient();

  const { data: paper } = await db.from("papers").select("id, source_pdf_path, status").eq("id", id).maybeSingle();
  if (!paper) return Response.json({ error: "Paper not found." }, { status: 404 });
  // Re-extracting replaces questions, which would delete answer keys, tags and student
  // responses that hang off them. Only papers not yet tagged can be extracted.
  if (!EXTRACTABLE.has(paper.status)) {
    return Response.json({ error: "This paper is past extraction; edit its questions instead." }, { status: 409 });
  }

  try {
    if (parsed.data.step === "check") {
      const { outline, questions } = await loadExtraction(db, id);
      const issues = checkExtraction(outline, questions);
      await flagPaper(db, id, issues);
      const { error } = await db.from("papers").update({ status: "extracted" }).eq("id", id);
      if (error) throw new Error(error.message);
      return Response.json({ issues });
    }

    if (!paper.source_pdf_path) return Response.json({ error: "This paper has no PDF." }, { status: 409 });
    const { data: file, error: downloadError } = await db.storage.from("papers").download(paper.source_pdf_path);
    if (downloadError) throw new Error(downloadError.message);
    const pdf = Buffer.from(await file.arrayBuffer()).toString("base64");

    if (parsed.data.step === "outline") {
      const run = await extractOutline(anthropic(), pdf);
      await logRun(db, "extract", PROMPT_VERSION, run);
      await saveOutline(db, id, run.data);
      return Response.json({ sections: run.data.sections.length, costUsd: run.costUsd });
    }

    const { outline } = await loadExtraction(db, id);
    const section = outline.sections[parsed.data.position - 1];
    if (!section) return Response.json({ error: "No such section." }, { status: 404 });
    const run = await extractSection(anthropic(), pdf, section);
    await logRun(db, "extract", PROMPT_VERSION, run);
    await saveSection(db, id, parsed.data.position, run.data.questions);
    return Response.json({ questions: run.data.questions.length, costUsd: run.costUsd });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
