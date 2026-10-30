import { describe, expect, it } from "vitest";
import { scorePaper, scoreQuestion, type ScorableQuestion, type SectionRules } from "./score";

const neet: SectionRules = { id: "A", marksCorrect: 4, marksWrong: -1, marksUnattempted: 0 };
const cbse: SectionRules = { id: "C", marksCorrect: 1, marksWrong: 0, marksUnattempted: 0 };
const jeeAdvMulti: SectionRules = { id: "M", marksCorrect: 4, marksWrong: -2, marksUnattempted: 0 };

const mcq = (id: string, correct: string, sectionId = "A", position = 1): ScorableQuestion => ({
  id,
  sectionId,
  position,
  kind: "mcq_single",
  correctLabels: [correct],
});

describe("single-correct MCQ", () => {
  const q = mcq("q1", "A");
  it("awards full marks for the correct option", () => {
    expect(scoreQuestion(q, neet, { questionId: "q1", selectedLabels: ["A"] }).marks).toBe(4);
  });
  it("applies negative marking for a wrong option", () => {
    expect(scoreQuestion(q, neet, { questionId: "q1", selectedLabels: ["B"] }).marks).toBe(-1);
  });
  it("gives zero when unattempted", () => {
    const r = scoreQuestion(q, neet, undefined);
    expect(r).toMatchObject({ outcome: "unattempted", marks: 0 });
  });
  it("accepts any option the official key lists (bonus questions)", () => {
    const bonus = { ...q, correctLabels: ["A", "C"] };
    expect(scoreQuestion(bonus, neet, { questionId: "q1", selectedLabels: ["C"] }).marks).toBe(4);
  });
});

describe("JEE Advanced multi-correct MCQ", () => {
  const q: ScorableQuestion = { id: "m", sectionId: "M", position: 1, kind: "mcq_multi", correctLabels: ["A", "B", "D"] };
  const score = (sel: string[]) => scoreQuestion(q, jeeAdvMulti, { questionId: "m", selectedLabels: sel });

  it("full marks for exactly the correct set", () => expect(score(["A", "B", "D"]).marks).toBe(4));
  it("+2 for two correct options and no wrong ones", () => {
    expect(score(["A", "D"])).toMatchObject({ outcome: "partial", marks: 2 });
  });
  it("+1 for one correct option", () => expect(score(["B"]).marks).toBe(1));
  it("negative if any wrong option is chosen", () => expect(score(["A", "C"]).marks).toBe(-2));
});

describe("numerical answers", () => {
  const q: ScorableQuestion = {
    id: "n",
    sectionId: "A",
    position: 1,
    kind: "numerical",
    numericalAnswer: 2.5,
    numericalTolerance: 0.01,
  };
  it("accepts values within tolerance", () => {
    expect(scoreQuestion(q, neet, { questionId: "n", numericalValue: 2.51 }).outcome).toBe("correct");
  });
  it("rejects values outside tolerance", () => {
    expect(scoreQuestion(q, neet, { questionId: "n", numericalValue: 2.6 }).outcome).toBe("wrong");
  });
  it("treats zero as an attempted answer", () => {
    expect(scoreQuestion({ ...q, numericalAnswer: 0 }, neet, { questionId: "n", numericalValue: 0 }).marks).toBe(4);
  });
});

describe("descriptive answers", () => {
  const q: ScorableQuestion = { id: "d", sectionId: "C", position: 1, kind: "descriptive", marks: 3 };
  it("uses the AI estimate and flags it", () => {
    expect(scoreQuestion(q, cbse, { questionId: "d", estimatedMarks: 2 })).toMatchObject({
      marks: 2,
      outcome: "partial",
      estimated: true,
    });
  });
  it("prefers the admin override and clears the estimate flag", () => {
    expect(scoreQuestion(q, cbse, { questionId: "d", estimatedMarks: 2, adminOverrideMarks: 3 })).toMatchObject({
      marks: 3,
      estimated: false,
    });
  });
  it("clamps marks to the question maximum", () => {
    expect(scoreQuestion(q, cbse, { questionId: "d", estimatedMarks: 5 }).marks).toBe(3);
  });
});

describe("whole paper", () => {
  it("adds up marks with negative marking", () => {
    const qs = [mcq("a", "A", "A", 1), mcq("b", "B", "A", 2), mcq("c", "C", "A", 3)];
    const result = scorePaper([neet], qs, [
      { questionId: "a", selectedLabels: ["A"] },
      { questionId: "b", selectedLabels: ["A"] },
    ]);
    expect(result.total).toBe(3);
    expect(result.estimated).toBe(false);
  });

  it("counts only the first N attempted questions when a section says attempt any N", () => {
    const limited: SectionRules = { ...neet, id: "B", attemptLimit: 2 };
    const qs = [mcq("a", "A", "B", 1), mcq("b", "A", "B", 2), mcq("c", "A", "B", 3)];
    const result = scorePaper([limited], qs, ["a", "b", "c"].map((id) => ({ questionId: id, selectedLabels: ["A"] })));
    expect(result.total).toBe(8);
    expect(result.questions[2].outcome).toBe("not_counted");
  });

  it("counts only the best alternative of a CBSE OR choice", () => {
    const qs: ScorableQuestion[] = [
      { id: "x", sectionId: "C", position: 1, kind: "descriptive", marks: 3, internalChoiceGroup: "q30" },
      { id: "y", sectionId: "C", position: 2, kind: "descriptive", marks: 3, internalChoiceGroup: "q30" },
    ];
    const result = scorePaper([cbse], qs, [
      { questionId: "x", estimatedMarks: 1 },
      { questionId: "y", estimatedMarks: 2 },
    ]);
    expect(result.total).toBe(2);
    expect(result.estimated).toBe(true);
  });
});
