import { z } from "zod";
import { anthropic } from "@/lib/ai/client";
import { getCurrentUser } from "@/lib/auth";
import { KEYS_FLAG_PREFIX, KEYS_PROMPT_VERSION, checkKeys, readKeys } from "@/lib/import/keys";
import { flagPaper, logRun } from "@/lib/import/save";
import { loadAnswers, loadTargets, saveKeys } from "@/lib/import/save-keys";
import { createAdminClient } from "@/lib/supabase/server";

// Reads answer keys from the marking scheme one section per request, then checks them all.
export const maxDuration = 300;

const step = z.discriminatedUnion("step", [
  z.object({ step: z.literal("section"), position: z.number().int().min(1) }),
  z.object({ step: z.literal("check") }),
]);

export async function POST(request: Request, ctx: RouteContext<"/api/admin/papers/[id]/keys">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });

  const parsed = step.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unknown step." }, { status: 400 });
  const { id } = await ctx.params;
  const db = createAdminClient();

  const { data: paper } = await db
    .from("papers")
    .select("id, variant, marking_scheme_pdf_path")
    .eq("id", id)
    .maybeSingle();
  if (!paper) return Response.json({ error: "Paper not found." }, { status: 404 });
  if (!paper.marking_scheme_pdf_path) {
    return Response.json({ error: "Upload the marking scheme first." }, { status: 409 });
  }

  try {
    if (parsed.data.step === "check") {
      const targets = await loadTargets(db, id);
      const issues = checkKeys(targets, await loadAnswers(db, targets));
      await flagPaper(db, id, issues, KEYS_FLAG_PREFIX);
      return Response.json({ issues });
    }

    const targets = await loadTargets(db, id, parsed.data.position);
    if (targets.length === 0) return Response.json({ answers: 0, costUsd: 0 });
    const { data: file, error } = await db.storage.from("papers").download(paper.marking_scheme_pdf_path);
    if (error) throw new Error(error.message);
    const pdf = Buffer.from(await file.arrayBuffer()).toString("base64");
    const run = await readKeys(anthropic(), pdf, paper.variant, targets);
    await logRun(db, "keys", KEYS_PROMPT_VERSION, run);
    await saveKeys(db, targets, run.data.answers);
    return Response.json({ answers: run.data.answers.length, costUsd: run.costUsd });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
