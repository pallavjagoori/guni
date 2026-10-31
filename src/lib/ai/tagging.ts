import { z } from "zod";

// Output contract for the tagging job. The model answers with IDs from the closed
// taxonomy we send it; validateTags() rejects anything outside that list.

export const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"] as const;

export const tagResultSchema = z.object({
  chapterId: z.string(),
  topicId: z.string(),
  conceptIds: z.array(z.string()).min(1).max(4),
  bloom: z.enum(BLOOM_LEVELS),
  difficulty: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
});

export type TagResult = z.infer<typeof tagResultSchema>;

export interface Taxonomy {
  chapters: { id: string; topics: { id: string; conceptIds: string[] }[] }[];
}

export type TagValidation = { ok: true; tags: TagResult } | { ok: false; errors: string[] };

export function validateTags(raw: unknown, taxonomy: Taxonomy): TagValidation {
  const parsed = tagResultSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const tags = parsed.data;
  const errors: string[] = [];

  const chapter = taxonomy.chapters.find((c) => c.id === tags.chapterId);
  if (!chapter) {
    errors.push(`unknown chapter ${tags.chapterId}`);
    return { ok: false, errors };
  }
  const topic = chapter.topics.find((t) => t.id === tags.topicId);
  if (!topic) {
    errors.push(`topic ${tags.topicId} is not in chapter ${tags.chapterId}`);
  } else {
    // Concepts may come from other topics of the same chapter, but must exist there.
    const chapterConcepts = new Set(chapter.topics.flatMap((t) => t.conceptIds));
    for (const c of tags.conceptIds) {
      if (!chapterConcepts.has(c)) errors.push(`concept ${c} is not in chapter ${tags.chapterId}`);
    }
  }
  if (new Set(tags.conceptIds).size !== tags.conceptIds.length) errors.push("duplicate concept ids");

  return errors.length ? { ok: false, errors } : { ok: true, tags };
}
