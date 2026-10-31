import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { checkExtraction, extractOutline, extractSection, type ExtractedQuestion, type Outline } from "./extract";

const outline: Outline = {
  totalQuestions: 3,
  maxMarks: 6,
  durationMinutes: 180,
  sections: [
    { title: "Section A", firstQuestion: 1, lastQuestion: 2, marksEach: 1, objective: true, instructions: "" },
    { title: "Section B", firstQuestion: 3, lastQuestion: 3, marksEach: 4, objective: false, instructions: "" },
  ],
};
const options = ["A", "B", "C", "D"].map((label) => ({ label, body: label.toLowerCase() }));
const mcq = (number: number): ExtractedQuestion => ({ number, alternative: 1, kind: "mcq_single", stem: "s", marks: 1, options, figure: null });
const long = (alternative: number): ExtractedQuestion => ({ number: 3, alternative, kind: "descriptive", stem: "s", marks: 4, options: [], figure: null });
const good = [mcq(1), mcq(2), long(1), long(2)];

describe("checkExtraction", () => {
  it("accepts a complete paper, counting an OR choice once", () => {
    expect(checkExtraction(outline, good)).toEqual([]);
  });

  it("reports missing and out-of-range questions", () => {
    const issues = checkExtraction(outline, [mcq(1), long(1), { ...mcq(9) }]);
    expect(issues).toContain("Question 2 is missing.");
    expect(issues).toContain("Question 9 is outside the paper's range.");
    expect(issues).toContain("Question 9 is not in any section.");
  });

  it("reports gaps in alternatives", () => {
    expect(checkExtraction(outline, [mcq(1), mcq(2), long(1), long(3)])).toContain("Question 3 has alternatives 1, 3.");
  });

  it("reports marks that disagree with the section and the paper total", () => {
    const issues = checkExtraction(outline, [mcq(1), { ...mcq(2), marks: 2 }, long(1)]);
    expect(issues).toContain("Question 2 carries 2 marks; its section gives 1.");
    expect(issues).toContain("Marks add up to 7; the paper says 6.");
  });

  it("names the alternative when an OR version is wrong", () => {
    const issues = checkExtraction(outline, [mcq(1), mcq(2), long(1), { ...long(2), marks: 3 }]);
    expect(issues).toContain("Question 3 (alternative 2) carries 3 marks; its section gives 4.");
  });

  it("checks multiple-choice options", () => {
    const issues = checkExtraction(outline, [{ ...mcq(1), options: options.slice(0, 3) }, { ...mcq(2), kind: "assertion_reason", options: [] }, long(1)]);
    expect(issues).toContain("Question 1 should have four options, A to D or 1 to 4; found A, B, C.");
    expect(issues).toContain("Question 2 should have four options, A to D or 1 to 4; found none.");
  });

  it("accepts numbered options (JEE, NEET) and fractional marks", () => {
    const numbered = ["1", "2", "3", "4"].map((label) => ({ label, body: label }));
    expect(checkExtraction(outline, [{ ...mcq(1), options: numbered }, mcq(2), long(1)])).toEqual([]);
    // 0.1 + 0.1 + 0.1 is 0.30000000000000004 in floating point.
    const tenths: Outline = {
      totalQuestions: 3, maxMarks: 0.3, durationMinutes: 60,
      sections: [{ title: "A", firstQuestion: 1, lastQuestion: 3, marksEach: 0.1, objective: true, instructions: "" }],
    };
    expect(checkExtraction(tenths, [1, 2, 3].map((n) => ({ ...mcq(n), marks: 0.1 })))).toEqual([]);
  });

  it("flags options on a written question and written questions in an objective section", () => {
    const issues = checkExtraction(outline, [{ ...mcq(1), kind: "descriptive" }, { ...mcq(2), kind: "mcq_multi" }, long(1)]);
    expect(issues).toContain("Question 1 is descriptive but has options.");
    expect(issues).toContain("Question 1 is descriptive in an objective section.");
  });

  it("checks diagram boxes", () => {
    const figure = (box: number[]) => ({ page: 5, box, caption: "circuit" });
    expect(checkExtraction(outline, [{ ...mcq(1), figure: figure([0.1, 0.2, 0.9, 0.5]) }, mcq(2), long(1)])).toEqual([]);
    expect(checkExtraction(outline, [{ ...mcq(1), figure: figure([0.1, 0.2, 1.4, 0.5]) }, mcq(2), long(1)])).toContain(
      "Question 1 has a diagram box outside the page.",
    );
    expect(checkExtraction(outline, [{ ...mcq(1), figure: figure([0.1, 0.2]) }, mcq(2), long(1)])).toContain(
      "Question 1 has a diagram box outside the page.",
    );
    expect(checkExtraction(outline, [{ ...mcq(1), figure: figure([-0.1, 0.2, 0.5, 0.5]) }, mcq(2), long(1)])).toContain(
      "Question 1 has a diagram box outside the page.",
    );
  });
});

function fakeClient(response: object) {
  const parse = vi.fn(async () => response);
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}
const usage = { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

describe("extraction calls", () => {
  it("sends the PDF once, cached, and returns the parsed outline with its cost", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: outline, usage });
    const result = await extractOutline(client, "UERG");
    expect(result.data).toEqual(outline);
    expect(result.model).toBe("claude-sonnet-5-5");
    expect(result.costUsd).toBeCloseTo((1000 * 2 + 500 * 10) / 1e6);
    const params = (parse.mock.calls[0] as unknown[])[0] as { messages: { content: { type: string; cache_control?: object }[] }[] };
    const doc = params.messages[0].content[0];
    expect(doc).toMatchObject({ type: "document", cache_control: { type: "ephemeral" } });
  });

  it("asks for one section's question range", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: { questions: good }, usage });
    const result = await extractSection(client, "UERG", outline.sections[1]);
    expect(result.data.questions).toHaveLength(4);
    expect(JSON.stringify(parse.mock.calls[0])).toContain("Transcribe Section B: questions 3 to 3");
  });

  it("fails when the answer was cut off", async () => {
    const { client } = fakeClient({ stop_reason: "max_tokens", parsed_output: null, usage });
    await expect(extractOutline(client, "UERG")).rejects.toThrow(/The AI stopped early \(max_tokens\)/);
  });

  it("fails when nothing could be parsed", async () => {
    const { client } = fakeClient({ stop_reason: "end_turn", parsed_output: null, usage });
    await expect(extractOutline(client, "UERG")).rejects.toThrow(/The AI stopped early \(end_turn\)/);
  });
});
