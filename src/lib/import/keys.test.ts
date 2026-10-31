import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { checkKeys, readKeys, type KeyAnswer, type KeyTarget } from "./keys";

const target = (number: number, kind: KeyTarget["kind"], extra: Partial<KeyTarget> = {}): KeyTarget => ({
  id: `q${number}`, label: String(number), number, alternative: 1, kind, marks: 1, stem: "A long   stem\nwith lines", optionLabels: ["A", "B", "C", "D"], ...extra,
});
const answer = (number: number, extra: Partial<KeyAnswer> = {}): KeyAnswer => ({
  number, alternative: 1, correctLabels: [], numericalAnswer: null, numericalTolerance: null, steps: [], ...extra,
});

describe("checkKeys", () => {
  it("accepts complete, consistent answers", () => {
    const targets = [target(1, "mcq_single"), target(2, "numerical"), target(3, "descriptive", { marks: 2, alternative: 2, optionLabels: [] })];
    const answers = [
      answer(1, { correctLabels: ["C"] }),
      answer(2, { numericalAnswer: 0 }),
      answer(3, { alternative: 2, steps: [{ text: "a", marks: 0.5 }, { text: "b", marks: 1.5 }] }),
    ];
    expect(checkKeys(targets, answers)).toEqual([]);
  });

  it("reports missing answers, naming OR alternatives", () => {
    expect(checkKeys([target(1, "mcq_single"), target(2, "descriptive", { alternative: 2 })], [])).toEqual([
      "Question 1 has no answer in the marking scheme.",
      "Question 2 (alternative 2) has no answer in the marking scheme.",
    ]);
  });

  it("checks objective answers against the question's options", () => {
    expect(checkKeys([target(1, "assertion_reason")], [answer(1)])).toEqual(["Question 1 has no correct option in the marking scheme."]);
    expect(checkKeys([target(1, "mcq_multi")], [answer(1, { correctLabels: ["A", "E"] })])).toEqual([
      "Question 1's answer names option E, which the question doesn't have.",
    ]);
  });

  it("reports questions whose label can't be matched", () => {
    expect(checkKeys([target(0, "mcq_single", { label: "5a" })], [answer(0, { correctLabels: ["A"] })])).toEqual([
      'Question labelled "5a" can\'t be matched to the marking scheme.',
    ]);
  });

  it("needs a numerical answer", () => {
    expect(checkKeys([target(1, "numerical")], [answer(1)])).toEqual(["Question 1 has no numerical answer in the marking scheme."]);
  });

  it("checks that marking steps add up to the question's marks", () => {
    expect(checkKeys([target(1, "descriptive", { marks: 3 })], [answer(1)])).toEqual(["Question 1 has no marking steps."]);
    expect(checkKeys([target(1, "descriptive", { marks: 3 })], [answer(1, { steps: [{ text: "a", marks: 2 }] })])).toEqual([
      "Question 1's marking steps add up to 2, not 3.",
    ]);
  });
});

describe("readKeys", () => {
  it("asks for one set's answers, listing each question briefly", async () => {
    const parse = vi.fn(async (..._args: unknown[]) => ({
      stop_reason: "end_turn",
      parsed_output: { answers: [answer(1, { correctLabels: ["B"] })] },
      usage: { input_tokens: 10, output_tokens: 10 },
    }));
    const client = { messages: { parse } } as unknown as Anthropic;
    const result = await readKeys(client, "UERG", "55/1/1", [target(1, "mcq_single", { stem: "x".repeat(300) })]);
    expect(result.data.answers[0].correctLabels).toEqual(["B"]);
    const params = parse.mock.calls[0][0] as { system: string; messages: { content: { text?: string }[] }[] };
    const text = params.messages[0].content[1].text!;
    expect(text).toContain("Use only set 55/1/1.");
    expect(text).toContain(`- Q1 alternative 1 (mcq_single, 1 marks): ${"x".repeat(140)}\n`.trimEnd());
    expect(text).not.toContain("x".repeat(141));
    expect(params.system).toContain("marking scheme");
  });
});
