import { describe, expect, it } from "vitest";
import { scorePaper, scoreQuestion, type ScorableQuestion, type SectionRules } from "./score";

const neet: SectionRules = { id: "A", position: 1, marksCorrect: 4, marksWrong: -1, marksUnattempted: 0 };
const cbse: SectionRules = { id: "C", position: 3, marksCorrect: 1, marksWrong: 0, marksUnattempted: 0 };
const jeeAdvMulti: SectionRules = { id: "M", position: 1, marksCorrect: 4, marksWrong: -2, marksUnattempted: 0 };

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
  it("treats a response with no selection as unattempted", () => {
    expect(scoreQuestion(q, neet, { questionId: "q1" }).outcome).toBe("unattempted");
  });
  it("gives 0 and flags the question when the answer key is missing", () => {
    const noKey = { ...q, correctLabels: undefined };
    expect(scoreQuestion(noKey, neet, { questionId: "q1", selectedLabels: ["A"] })).toMatchObject({ outcome: "no_key", marks: 0 });
  });
  it("treats an empty answer key as missing", () => {
    const emptyKey = { ...q, correctLabels: [] };
    expect(scoreQuestion(emptyKey, neet, { questionId: "q1", selectedLabels: ["B"] }).outcome).toBe("no_key");
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
  it("gives 0 instead of negative marks when the answer key is missing", () => {
    const noKey = { ...q, correctLabels: undefined };
    expect(scoreQuestion(noKey, jeeAdvMulti, { questionId: "m", selectedLabels: ["A"] })).toMatchObject({ outcome: "no_key", marks: 0 });
  });
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
  it("requires an exact match when no tolerance is set", () => {
    const exact = { ...q, numericalTolerance: null };
    expect(scoreQuestion(exact, neet, { questionId: "n", numericalValue: 2.5 }).outcome).toBe("correct");
    expect(scoreQuestion(exact, neet, { questionId: "n", numericalValue: 2.51 }).outcome).toBe("wrong");
  });
  it("flags a numerical question with no answer key", () => {
    const noAnswer = { ...q, numericalAnswer: null };
    expect(scoreQuestion(noAnswer, neet, { questionId: "n", numericalValue: 1 }).outcome).toBe("no_key");
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
  it("reports zero marks as wrong", () => {
    expect(scoreQuestion(q, cbse, { questionId: "d", estimatedMarks: 0 }).outcome).toBe("wrong");
  });
  it("reports full marks as correct", () => {
    expect(scoreQuestion(q, cbse, { questionId: "d", estimatedMarks: 3 }).outcome).toBe("correct");
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

  it("orders questions by section position, then question position", () => {
    // Section ids are UUIDs in the database, so order must come from position, not id.
    const first: SectionRules = { ...cbse, id: "zzz", position: 1 };
    const second: SectionRules = { ...cbse, id: "aaa", position: 2 };
    const qs = [mcq("late", "A", "aaa", 2), mcq("first", "A", "zzz", 1), mcq("early", "A", "aaa", 1)];
    const result = scorePaper([second, first], qs, []);
    expect(result.questions.map((r) => r.questionId)).toEqual(["first", "early", "late"]);
  });

  it("scores the rest of the paper when one key is missing", () => {
    const qs = [mcq("a", "A", "A", 1), { ...mcq("b", "A", "A", 2), correctLabels: [] }];
    const result = scorePaper([neet], qs, [
      { questionId: "a", selectedLabels: ["A"] },
      { questionId: "b", selectedLabels: ["A"] },
    ]);
    expect(result.total).toBe(4);
    expect(result.questions.map((r) => r.outcome)).toEqual(["correct", "no_key"]);
  });

  it("rejects a question whose section is missing", () => {
    expect(() => scorePaper([neet], [mcq("x", "A", "missing")], [])).toThrow(/unknown section/);
  });

  it("keeps the first alternative when both OR choices score the same", () => {
    const qs: ScorableQuestion[] = [
      { id: "x", sectionId: "C", position: 1, kind: "descriptive", marks: 3, internalChoiceGroup: "q30" },
      { id: "y", sectionId: "C", position: 2, kind: "descriptive", marks: 3, internalChoiceGroup: "q30" },
    ];
    const result = scorePaper([cbse], qs, [
      { questionId: "x", estimatedMarks: 2 },
      { questionId: "y", estimatedMarks: 2 },
    ]);
    expect(result.questions.map((r) => r.outcome)).toEqual(["partial", "not_counted"]);
    expect(result.total).toBe(2);
  });

  it("keeps the answered alternative over an unanswered one, even with negative marks", () => {
    const neg: SectionRules = { ...neet, id: "N" };
    const qs: ScorableQuestion[] = [
      { ...mcq("x", "A", "N", 1), internalChoiceGroup: "g" },
      { ...mcq("y", "A", "N", 2), internalChoiceGroup: "g" },
    ];
    const result = scorePaper([neg], qs, [{ questionId: "y", selectedLabels: ["B"] }]);
    expect(result.questions.map((r) => r.outcome)).toEqual(["not_counted", "wrong"]);
    expect(result.total).toBe(-1);
  });

  it("keeps the first alternative as unattempted when neither OR choice is answered", () => {
    const qs: ScorableQuestion[] = [
      { id: "x", sectionId: "C", position: 1, kind: "descriptive", marks: 3, internalChoiceGroup: "q30" },
      { id: "y", sectionId: "C", position: 2, kind: "descriptive", marks: 3, internalChoiceGroup: "q30" },
    ];
    const result = scorePaper([cbse], qs, []);
    expect(result.questions.map((r) => r.outcome)).toEqual(["unattempted", "not_counted"]);
  });

  it("counts an OR group once towards an attempt limit", () => {
    const limited: SectionRules = { ...neet, id: "L", attemptLimit: 2 };
    const qs: ScorableQuestion[] = [
      { ...mcq("x", "A", "L", 1), internalChoiceGroup: "g" },
      { ...mcq("y", "A", "L", 2), internalChoiceGroup: "g" },
      mcq("z", "A", "L", 3),
    ];
    const result = scorePaper([limited], qs, ["x", "y", "z"].map((id) => ({ questionId: id, selectedLabels: ["A"] })));
    expect(result.questions.map((r) => r.outcome)).toEqual(["correct", "not_counted", "correct"]);
    expect(result.total).toBe(8);
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
