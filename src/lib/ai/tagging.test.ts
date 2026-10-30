import { describe, expect, it } from "vitest";
import { validateTags, type Taxonomy } from "./tagging";

const taxonomy: Taxonomy = {
  chapters: [
    {
      id: "ch1",
      topics: [
        { id: "t1", conceptIds: ["c1", "c2"] },
        { id: "t2", conceptIds: ["c3"] },
      ],
    },
  ],
};

const good = { chapterId: "ch1", topicId: "t1", conceptIds: ["c1", "c3"], bloom: "apply", difficulty: 2, confidence: 0.9 };

describe("validateTags", () => {
  it("accepts tags drawn from the taxonomy", () => {
    expect(validateTags(good, taxonomy).ok).toBe(true);
  });
  it("rejects an invented chapter", () => {
    expect(validateTags({ ...good, chapterId: "made-up" }, taxonomy)).toEqual({ ok: false, errors: ["unknown chapter made-up"] });
  });
  it("rejects a concept from outside the chapter", () => {
    const r = validateTags({ ...good, conceptIds: ["c9"] }, taxonomy);
    expect(r.ok).toBe(false);
  });
  it("rejects a Bloom level outside the fixed list", () => {
    expect(validateTags({ ...good, bloom: "memorise" }, taxonomy).ok).toBe(false);
  });
  it("rejects duplicate concepts", () => {
    expect(validateTags({ ...good, conceptIds: ["c1", "c1"] }, taxonomy).ok).toBe(false);
  });
});
