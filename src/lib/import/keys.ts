// Reads official answers and marking steps from a marking scheme PDF. Like extraction,
// the AI only copies what the scheme says; code then checks every answer against the
// question it belongs to, and problems are flagged for an admin.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runPdf, type RunResult } from "./extract";

export const KEYS_PROMPT_VERSION = "keys-v2";
export const KEYS_FLAG_PREFIX = "Answer keys: ";

export const keyResultSchema = z.object({
  answers: z.array(
    z.object({
      number: z.number().int(),
      alternative: z.number().int(),
      correctLabels: z.array(z.string()), // objective questions: every option the scheme accepts
      numericalAnswer: z.number().nullable(),
      numericalTolerance: z.number().nullable(),
      steps: z.array(z.object({ text: z.string(), marks: z.number() })), // value points with their marks
    }),
  ),
});
export type KeyAnswer = z.infer<typeof keyResultSchema>["answers"][number];

export interface KeyTarget {
  id: string;
  label: string;
  number: number;
  alternative: number;
  kind: "mcq_single" | "mcq_multi" | "assertion_reason" | "numerical" | "descriptive";
  marks: number;
  stem: string;
  optionLabels: string[];
}

const SYSTEM = `You copy official answers from an exam marking scheme into structured data.
Rules:
- Copy exactly what the scheme states. Never solve, correct or add an answer of your own.
- If the scheme gives no answer for a question, leave correctLabels empty, numericalAnswer null and steps empty.
- For multiple choice and assertion-reason questions, give the option label(s) the scheme accepts, without brackets.
  If the scheme accepts several options or awards marks for any attempt, list every accepted label.
- For written answers, give each value point as a step with the marks the scheme awards for it.
  Write every formula and symbol in LaTeX between $...$ (e.g. $\\frac{hc}{\\lambda}$, $10^{-19}$), never Unicode math characters.
- A question with "OR" alternatives has a separate answer for each alternative (1 = first version, 2 = after the first OR).`;

const preview = (stem: string) => stem.replace(/\s+/g, " ").slice(0, 140);

export function readKeys(
  client: Anthropic,
  schemePdfBase64: string,
  setCode: string,
  targets: KeyTarget[],
): Promise<RunResult<z.infer<typeof keyResultSchema>>> {
  const list = targets
    .map((t) => `- Q${t.number} alternative ${t.alternative} (${t.kind}, ${t.marks} marks): ${preview(t.stem)}`)
    .join("\n");
  return runPdf(
    client,
    SYSTEM,
    schemePdfBase64,
    `This marking scheme may cover several question paper sets. Use only set ${setCode}.\n` +
      `Give the official answer for each of these questions:\n${list}`,
    keyResultSchema,
  );
}

const OBJECTIVE = new Set(["mcq_single", "mcq_multi", "assertion_reason"]);

export function checkKeys(targets: KeyTarget[], answers: KeyAnswer[]): string[] {
  const issues: string[] = [];
  const key = (n: number, a: number) => `${n}/${a}`;
  const byKey = new Map(answers.map((a) => [key(a.number, a.alternative), a]));
  for (const t of targets) {
    if (t.number === 0) {
      issues.push(`Question labelled "${t.label}" can't be matched to the marking scheme.`);
      continue;
    }
    const name = t.alternative > 1 ? `Question ${t.number} (alternative ${t.alternative})` : `Question ${t.number}`;
    const answer = byKey.get(key(t.number, t.alternative));
    if (!answer) {
      issues.push(`${name} has no answer in the marking scheme.`);
      continue;
    }
    if (OBJECTIVE.has(t.kind)) {
      if (answer.correctLabels.length === 0) issues.push(`${name} has no correct option in the marking scheme.`);
      const unknown = answer.correctLabels.filter((l) => !t.optionLabels.includes(l));
      if (unknown.length) issues.push(`${name}'s answer names option ${unknown.join(", ")}, which the question doesn't have.`);
    } else if (t.kind === "numerical") {
      if (answer.numericalAnswer == null) issues.push(`${name} has no numerical answer in the marking scheme.`);
    } else {
      const total = answer.steps.reduce((sum, s) => sum + s.marks, 0);
      if (answer.steps.length === 0) issues.push(`${name} has no marking steps.`);
      else if (Math.abs(total - t.marks) > 1e-9) issues.push(`${name}'s marking steps add up to ${total}, not ${t.marks}.`);
    }
  }
  return issues;
}
