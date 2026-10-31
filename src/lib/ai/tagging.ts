import { z } from "zod";

// Output contract for the tagging job. The model answers with IDs from the closed
// taxonomy we send it; validateTags() rejects anything outside that list.

/** Bloom's taxonomy levels, lowest to highest. */
export const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"] as const;

/** Shape of a tagging answer: taxonomy ids, Bloom level, difficulty 1-5 and confidence 0-1. */
export const tagResultSchema = z.object({
  chapterId: z.string(),
  topicId: z.string(),
  conceptIds: z.array(z.string()).min(1).max(4),
  bloom: z.enum(BLOOM_LEVELS),
  difficulty: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
});

/** One question's tags. */
export type TagResult = z.infer<typeof tagResultSchema>;

/** The chapters, topics and concepts a question may be tagged with. */
export interface Taxonomy {
  chapters: { id: string; topics: { id: string; conceptIds: string[] }[] }[];
}

/** Result of validateTags. */
export type TagValidation = { ok: true; tags: TagResult } | { ok: false; errors: string[] };

/**
 * Checks a tagging answer against its schema and the closed taxonomy.
 * @returns The tags, or every reason they were rejected.
 */
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
