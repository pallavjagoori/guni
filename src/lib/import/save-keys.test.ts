import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fakeDb, op, type Call, type Reply } from "@/test/fake-db";
import type { KeyAnswer, KeyTarget } from "./keys";
import { loadAnswers, loadTargets, saveKeys } from "./save-keys";

const setup = (respond: (c: Call) => Reply = () => ({})) => {
  const { db, calls } = fakeDb(respond);
  return { db: db as unknown as SupabaseClient, calls };
};
const t = (id: string, number: number, kind: KeyTarget["kind"], alternative = 1): KeyTarget => ({
  id, label: String(number), number, alternative, kind, marks: 1, stem: "s", optionLabels: ["A", "B"],
});
const a = (number: number, extra: Partial<KeyAnswer> = {}): KeyAnswer => ({
  number, alternative: 1, correctLabels: [], numericalAnswer: null, numericalTolerance: null, steps: [], ...extra,
});

describe("loadTargets", () => {
  const sections = [
    { position: 2, marks_correct: 3, questions: [
      { id: "q3b", label: "3 (OR 1)", kind: "descriptive", stem: "s", marks: null, options: [] },
      { id: "q3", label: "3", kind: "descriptive", stem: "s", marks: 3, options: [] },
    ] },
    { position: 1, marks_correct: "1", questions: [
      { id: "qx", label: "odd", kind: "mcq_single", stem: "s", marks: null, options: [{ label: "B" }, { label: "A" }] },
      { id: "q1", label: "1", kind: "mcq_single", stem: "s", marks: null, options: [{ label: "B" }, { label: "A" }] },
    ] },
  ];

  it("returns every question, ordered by number and alternative", async () => {
    const { db, calls } = setup(() => ({ data: sections }));
    const targets = await loadTargets(db, "p1");
    expect(targets[0].label).toBe("odd");
    expect(targets.map((x) => [x.id, x.number, x.alternative, x.marks])).toEqual([
      ["qx", 0, 1, 1], ["q1", 1, 1, 1], ["q3", 3, 1, 3], ["q3b", 3, 2, 3],
    ]);
    expect(targets[1].optionLabels).toEqual(["A", "B"]);
    expect(calls[0].ops.filter((o) => o.method === "eq")).toHaveLength(1);
  });

  it("can limit to one section", async () => {
    const { db, calls } = setup(() => ({ data: [] }));
    expect(await loadTargets(db, "p1", 2)).toEqual([]);
    expect(calls[0].ops.filter((o) => o.method === "eq").map((o) => o.args)).toEqual([["paper_id", "p1"], ["position", 2]]);
  });
});

describe("saveKeys", () => {
  it("does nothing without questions", async () => {
    const { db, calls } = setup();
    await saveKeys(db, [], []);
    expect(calls).toHaveLength(0);
  });

  it("replaces official keys and marking-scheme solutions", async () => {
    const { db, calls } = setup();
    const targets = [t("q1", 1, "mcq_single"), t("q2", 2, "numerical"), t("q3", 3, "descriptive"), t("q4", 4, "mcq_single"), t("q5", 5, "numerical")];
    await saveKeys(db, targets, [
      a(1, { correctLabels: ["(b)", "A", "B", "E"], steps: [{ text: "why", marks: 1 }] }),
      a(2, { numericalAnswer: 2.5, numericalTolerance: null }),
      a(3, { steps: [{ text: "x", marks: 1 }] }),
      a(4),
      a(5, { numericalAnswer: 1, numericalTolerance: 0.1 }),
    ]);
    expect(op(calls[0], "eq")!.args).toEqual(["source", "official"]);
    expect(op(calls[0], "in")!.args).toEqual(["question_id", ["q1", "q2", "q3", "q4", "q5"]]);
    expect(op(calls[1], "eq")!.args).toEqual(["source", "marking_scheme"]);
    expect(op(calls[2], "upsert")!.args[1]).toEqual({ onConflict: "question_id", ignoreDuplicates: true });
    expect(op(calls[2], "upsert")!.args[0]).toEqual([
      { question_id: "q1", correct_labels: ["A", "B"], source: "official" },
      { question_id: "q2", numerical_answer: 2.5, numerical_tolerance: 0, source: "official" },
      { question_id: "q5", numerical_answer: 1, numerical_tolerance: 0.1, source: "official" },
    ]);
    expect(op(calls[3], "insert")!.args[0]).toEqual([
      { question_id: "q1", source: "marking_scheme", steps: [{ n: 1, text: "why", marks: 1 }] },
      { question_id: "q3", source: "marking_scheme", steps: [{ n: 1, text: "x", marks: 1 }] },
    ]);
  });

  it("skips questions whose label can't be matched", async () => {
    const { db, calls } = setup();
    await saveKeys(db, [t("qx", 0, "mcq_single")], [a(0, { correctLabels: ["A"] })]);
    expect(calls).toHaveLength(0);
  });

  it("skips inserts when the scheme had nothing usable", async () => {
    const { db, calls } = setup();
    await saveKeys(db, [t("q1", 1, "mcq_single"), t("q2", 2, "numerical"), t("q3", 3, "descriptive")], [a(1, { correctLabels: ["Z"] }), a(2)]);
    expect(calls).toHaveLength(2);
  });
});

describe("loadAnswers", () => {
  it("is empty without questions", async () => {
    const { db } = setup();
    expect(await loadAnswers(db, [])).toEqual([]);
  });

  it("rebuilds answers from saved keys and steps", async () => {
    const { db } = setup((c) =>
      c.target === "answer_keys"
        ? { data: [
            { question_id: "q1", correct_labels: ["A"], numerical_answer: null, numerical_tolerance: "0" },
            { question_id: "q2", correct_labels: [], numerical_answer: "2.5", numerical_tolerance: "0.1" },
          ] }
        : { data: [{ question_id: "q3", steps: [{ text: "x", marks: "1" }] }] },
    );
    const answers = await loadAnswers(db, [t("q1", 1, "mcq_single"), t("q2", 2, "numerical"), t("q3", 3, "descriptive"), t("q4", 4, "mcq_single")]);
    expect(answers).toEqual([
      a(1, { correctLabels: ["A"], numericalTolerance: 0 }),
      a(2, { numericalAnswer: 2.5, numericalTolerance: 0.1 }),
      a(3, { steps: [{ text: "x", marks: 1 }] }),
    ]);
  });
});
