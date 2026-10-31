import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fakeDb, op, type Call, type Reply } from "@/test/fake-db";
import type { ExtractedQuestion, Outline } from "./extract";
import { flagPaper, loadExtraction, logRun, saveOutline, saveSection } from "./save";

const setup = (respond: (c: Call) => Reply = () => ({})) => {
  const { db, calls } = fakeDb(respond);
  return { db: db as unknown as SupabaseClient, calls };
};
const outline: Outline = {
  totalQuestions: 2,
  maxMarks: 5,
  durationMinutes: 180,
  sections: [{ title: "Section A", firstQuestion: 1, lastQuestion: 2, marksEach: 1, objective: true, instructions: "MCQ" }],
};
const options = [{ label: "B", body: "b" }, { label: "A", body: "a" }];
const q = (number: number, alternative = 1, extra: Partial<ExtractedQuestion> = {}): ExtractedQuestion => ({
  number, alternative, kind: "mcq_single", stem: `Q${number}`, marks: 1, options, figure: null, ...extra,
});

describe("logRun", () => {
  it("records tokens including cached input, and the cost", async () => {
    const { db, calls } = setup(() => ({ data: { id: "run1" } }));
    const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 };
    expect(await logRun(db, "extract", "v1", { data: null, model: "m", usage, costUsd: 0.5 })).toBe("run1");
    expect(op(calls[0], "insert")!.args[0]).toEqual({
      job: "extract", model: "m", prompt_version: "v1", input_tokens: 1110, output_tokens: 5, cost_usd: 0.5,
    });
  });
  it("treats missing cache counts as zero", async () => {
    const { db, calls } = setup(() => ({ data: { id: "run1" } }));
    await logRun(db, "extract", "v1", { data: null, model: "m", usage: { input_tokens: 10, output_tokens: 5 }, costUsd: 0 });
    expect(op(calls[0], "insert")!.args[0]).toMatchObject({ input_tokens: 10 });
  });
  it("raises database errors", async () => {
    const { db } = setup(() => ({ error: { message: "boom" } }));
    await expect(logRun(db, "x", "v", { data: null, model: "m", usage: { input_tokens: 0, output_tokens: 0 }, costUsd: 0 })).rejects.toThrow("boom");
  });
});

describe("saveOutline", () => {
  it("updates the paper and replaces its sections", async () => {
    const { db, calls } = setup();
    await saveOutline(db, "p1", outline);
    expect(calls.map((c) => c.target)).toEqual(["papers", "sections", "sections"]);
    expect(op(calls[0], "update")!.args[0]).toEqual({ duration_minutes: 180, max_marks: 5 });
    expect(op(calls[1], "delete")).toBeDefined();
    expect(op(calls[2], "insert")!.args[0]).toEqual([
      { paper_id: "p1", position: 1, title: "Section A", instructions: "MCQ", marks_correct: 1, first_question: 1, last_question: 2, objective: true },
    ]);
  });
});

describe("saveSection", () => {
  it("replaces the section's questions, grouping OR alternatives, and saves options", async () => {
    const { db, calls } = setup((c) => {
      if (c.target === "sections") return { data: { id: "s1" } };
      if (c.target === "questions" && op(c, "insert")) return { data: [1, 2, 3].map((p) => ({ id: `q${p}`, position: p })) };
      return {};
    });
    await saveSection(db, "p1", 1, [q(2, 2, { kind: "descriptive", options: [] }), q(1), q(2, 1, { kind: "descriptive", options: [] })]);
    const rows = op(calls[2], "insert")!.args[0] as { label: string; internal_choice_group: string | null; position: number }[];
    expect(rows.map((r) => [r.position, r.label, r.internal_choice_group])).toEqual([
      [1, "1", null],
      [2, "2", "q2"],
      [3, "2 (OR 1)", "q2"],
    ]);
    expect(op(calls[3], "insert")!.args[0]).toEqual([
      { question_id: "q1", label: "B", body: "b" },
      { question_id: "q1", label: "A", body: "a" },
    ]);
  });

  it("stops after clearing when there is nothing to save", async () => {
    const { db, calls } = setup(() => ({ data: { id: "s1" } }));
    await saveSection(db, "p1", 1, []);
    expect(calls).toHaveLength(2);
  });

  it("skips the options insert for written questions", async () => {
    const { db, calls } = setup((c) => (c.target === "sections" ? { data: { id: "s1" } } : { data: [{ id: "q1", position: 1 }] }));
    await saveSection(db, "p1", 1, [q(1, 1, { kind: "descriptive", options: [] })]);
    expect(calls.map((c) => c.target)).toEqual(["sections", "questions", "questions"]);
  });
});

describe("flagPaper", () => {
  it("replaces open flags with the new issues", async () => {
    const { db, calls } = setup();
    await flagPaper(db, "p1", ["Question 2 is missing."]);
    expect(op(calls[0], "delete")).toBeDefined();
    expect(op(calls[0], "like")!.args).toEqual(["reason", "Extraction: %"]);
    expect(op(calls[1], "insert")!.args[0]).toEqual([{ entity: "paper", entity_id: "p1", reason: "Extraction: Question 2 is missing." }]);
  });
  it("only clears when there are no issues", async () => {
    const { db, calls } = setup();
    await flagPaper(db, "p1", []);
    expect(calls).toHaveLength(1);
  });
});

describe("loadExtraction", () => {
  it("rebuilds the outline and questions from saved rows", async () => {
    const section = (position: number, first: number, last: number, questions: object[]) => ({
      position, title: `S${position}`, instructions: position === 1 ? null : "x", marks_correct: "2",
      first_question: first, last_question: last, objective: false, questions,
    });
    const stored = (label: string, marks: number | null) => ({ label, kind: "descriptive", stem: "s", marks, figure: null, options: options });
    const { db } = setup(() => ({
      data: {
        max_marks: "6", duration_minutes: 180,
        sections: [section(2, 3, 3, [stored("3", 2), stored("3 (OR 1)", null)]), section(1, 1, 2, [stored("1", null), stored("2", 2)])],
      },
    }));
    const { outline: o, questions } = await loadExtraction(db, "p1");
    expect(o).toMatchObject({ totalQuestions: 3, maxMarks: 6, durationMinutes: 180 });
    expect(o.sections.map((s) => [s.title, s.instructions, s.marksEach])).toEqual([["S1", "", 2], ["S2", "x", 2]]);
    expect(questions.map((x) => [x.number, x.alternative, x.marks])).toEqual([[1, 1, 2], [2, 1, 2], [3, 1, 2], [3, 2, 2]]);
    expect(questions[0].options.map((x) => x.label)).toEqual(["A", "B"]);
  });

  it("turns a hand-edited label into question 0 so the checks report it", async () => {
    const { db } = setup(() => ({
      data: { max_marks: 1, duration_minutes: 1, sections: [{ position: 1, title: "A", instructions: null, marks_correct: 1, first_question: 1, last_question: 1, objective: false,
        questions: [{ label: "23(b)", kind: "descriptive", stem: "s", marks: 1, figure: null, options: [] }] }] },
    }));
    expect((await loadExtraction(db, "p1")).questions[0]).toMatchObject({ number: 0, alternative: 1 });
  });

  it("handles a paper with no sections yet", async () => {
    const { db } = setup(() => ({ data: { max_marks: 0, duration_minutes: 0, sections: [] } }));
    expect((await loadExtraction(db, "p1")).outline.totalQuestions).toBe(0);
  });
});
