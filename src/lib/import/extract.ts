// Turns a question paper PDF into structured questions. The AI only transcribes what is
// printed; every result is then checked by code (checkExtraction) and problems are flagged
// for an admin, never silently fixed.
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MODELS, costUsd, type Usage } from "@/lib/ai/models";

export const PROMPT_VERSION = "extract-v3";

export const outlineSchema = z.object({
  totalQuestions: z.number().int(),
  maxMarks: z.number(),
  durationMinutes: z.number().int(),
  sections: z.array(
    z.object({
      title: z.string(), // "Section A"
      firstQuestion: z.number().int(),
      lastQuestion: z.number().int(),
      marksEach: z.number(),
      objective: z.boolean(), // multiple choice / assertion-reason, answered by choosing options
      instructions: z.string(),
    }),
  ),
});
export type Outline = z.infer<typeof outlineSchema>;
export type OutlineSection = Outline["sections"][number];

export const questionKinds = ["mcq_single", "mcq_multi", "assertion_reason", "numerical", "descriptive"] as const;

export const extractedQuestionSchema = z.object({
  number: z.number().int(), // as printed: 23
  alternative: z.number().int(), // 1 for the first or only version, 2 for the "OR" alternative, ...
  part: z.string(), // a case study's sub-question as printed ("I", "II", ...); "" for a whole question
  kind: z.enum(questionKinds),
  stem: z.string(), // Plain text with LaTeX ($...$) for every formula
  marks: z.number(),
  options: z.array(z.object({ label: z.string(), body: z.string() })),
  figure: z
    .object({
      page: z.number().int(), // 1-based page of the PDF
      box: z.array(z.number()), // [x0, y0, x1, y1] as fractions of the page width/height
      caption: z.string(),
    })
    .nullable(),
});
export type ExtractedQuestion = z.infer<typeof extractedQuestionSchema>;

// "(iii)", "Part III" and "III" all name the same case-study part.
export const normalisePart = (part: string) => part.replace(/^\s*part\b/i, "").replace(/[()\s.]/g, "").toUpperCase();

export const sectionResultSchema = z.object({ questions: z.array(extractedQuestionSchema) });

const SYSTEM = `You transcribe exam question papers into structured data for a practice app.
Rules:
- Copy the wording exactly as printed (symbols follow the LaTeX rule below). Never reword, solve, correct or add anything.
- When the paper is bilingual, use only the English version.
- Write every formula, symbol, unit with a power, subscript and fraction in LaTeX between $...$
  (e.g. $\\frac{\\mu_0 I}{2\\pi a}$, $6.63 \\times 10^{-34}$ J s, $\\varepsilon_0$, $\\Omega$, $5\\sqrt{2}$ V).
  This applies even where the paper prints a symbol as a plain character: write μ as $\\mu$, × as $\\times$, Ω as $\\Omega$.
  Never use Unicode math characters or plain-text approximations like "10-34" or "mu0".
  If the paper prints a literal dollar sign, write it as \\$.
  Put a displayed equation on its own lines as $$...$$.
- Keep sub-parts such as (a), (b), (i), (ii) inside the question's stem, each on its own line with its label as printed.
- A question printed with "OR" between versions is several alternatives with the same number: alternative 1, 2, ...
- A case-study question (a passage followed by sub-questions (I), (II), ... that each have their own options)
  is one question per sub-question, all with the same number and part set to the sub-question's label ("I", "II", ...).
  Each stem is the passage, a blank line, then the sub-question. Each carries its own marks (usually 1).
  An "OR" between two versions of one sub-question gives that part alternatives 1 and 2.
  Every other question has part "".
  In a written case study (sub-questions without options), an "OR" inside one sub-part stays in the stem as text.
- Use kind "numerical" only for a question answered by entering a number in an objective section.
  A problem answered in writing is "descriptive", even when its answer is a number.
- Instructions shared by several questions ("For questions 13 to 16 ...") belong to the section, not to a stem.
- Options: give the label without brackets ("A") and the option text. Descriptive questions have no options.
- If a question has a diagram, give its page (1-based) and a box around the diagram only, as fractions of the page.`;

function pdfBlock(pdfBase64: string): Anthropic.DocumentBlockParam {
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    // The same PDF is sent once per section; caching makes the repeats cost 0.1x.
    cache_control: { type: "ephemeral" },
  };
}

export interface RunResult<T> {
  data: T;
  model: string;
  usage: Usage;
  costUsd: number;
}

// One structured-output call over a PDF. Shared by extraction and answer-key reading.
export async function runPdf<T>(
  client: Anthropic,
  system: string,
  pdfBase64: string,
  instruction: string,
  schema: z.ZodType<T>,
): Promise<RunResult<T>> {
  const model = MODELS.extract;
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    system,
    // Transcription needs care, not deep reasoning.
    output_config: { effort: "low", format: zodOutputFormat(schema) },
    messages: [{ role: "user", content: [pdfBlock(pdfBase64), { type: "text", text: instruction }] }],
  });
  if (response.stop_reason !== "end_turn" || response.parsed_output == null) {
    throw new Error(`The AI stopped early (${response.stop_reason})`);
  }
  return { data: response.parsed_output as T, model, usage: response.usage, costUsd: costUsd(model, response.usage) };
}

export function extractOutline(client: Anthropic, pdfBase64: string): Promise<RunResult<Outline>> {
  return runPdf(
    client,
    SYSTEM,
    pdfBase64,
    "Read the general instructions and give the paper's outline: total questions, maximum marks, duration, and each section with its question range, marks per question and whether its questions are objective (answered by choosing options).",
    outlineSchema,
  );
}

export function extractSection(
  client: Anthropic,
  pdfBase64: string,
  section: OutlineSection,
): Promise<RunResult<z.infer<typeof sectionResultSchema>>> {
  return runPdf(
    client,
    SYSTEM,
    pdfBase64,
    `Transcribe ${section.title}: questions ${section.firstQuestion} to ${section.lastQuestion}, every alternative of each.`,
    sectionResultSchema,
  );
}

// CBSE prints options as (A)-(D); JEE and NEET as (1)-(4).
const OPTION_LABELS = ["A,B,C,D", "1,2,3,4"];

// Deterministic checks against the paper's own outline. Each problem is one sentence for the admin.
export function checkExtraction(outline: Outline, questions: ExtractedQuestion[]): string[] {
  const issues: string[] = [];
  const byNumber = new Map<number, ExtractedQuestion[]>();
  for (const q of questions) byNumber.set(q.number, [...(byNumber.get(q.number) ?? []), q]);

  for (let n = 1; n <= outline.totalQuestions; n++) {
    if (!byNumber.has(n)) issues.push(`Question ${n} is missing.`);
  }
  for (const n of byNumber.keys()) {
    if (n < 1 || n > outline.totalQuestions) issues.push(`Question ${n} is outside the paper's range.`);
  }

  let total = 0;
  for (const [n, versions] of byNumber) {
    const section = outline.sections.find((s) => n >= s.firstQuestion && n <= s.lastQuestion);
    if (!section) issues.push(`Question ${n} is not in any section.`);
    const parts = new Map<string, ExtractedQuestion[]>();
    for (const v of versions) parts.set(normalisePart(v.part), [...(parts.get(normalisePart(v.part)) ?? []), v]);
    const whole = parts.has("");
    if (whole && parts.size > 1) issues.push(`Question ${n} mixes sub-questions with a whole question.`);

    let marks = 0;
    for (const [part, alts] of parts) {
      const name = part ? `Question ${n} (${part})` : `Question ${n}`;
      if (/[^A-Z0-9]/.test(part)) issues.push(`${name} has a part label that isn't a plain numeral.`);
      const alternatives = alts.map((v) => v.alternative).sort((a, b) => a - b);
      if (alternatives.some((a, i) => a !== i + 1)) issues.push(`${name} has alternatives ${alternatives.join(", ")}.`);
      marks += alts[0].marks;
      for (const v of alts) {
        const label = alts.length > 1 ? `${name} (alternative ${v.alternative})` : name;
        if (section && !part && v.marks !== section.marksEach) {
          issues.push(`${label} carries ${v.marks} marks; its section gives ${section.marksEach}.`);
        }
        if (part && v.marks !== alts[0].marks) issues.push(`${label} carries ${v.marks} marks; its other version carries ${alts[0].marks}.`);
        if (v.kind === "mcq_single" || v.kind === "mcq_multi" || v.kind === "assertion_reason") {
          if (!OPTION_LABELS.includes(v.options.map((o) => o.label).join())) {
            issues.push(`${label} should have four options, A to D or 1 to 4; found ${v.options.map((o) => o.label).join(", ") || "none"}.`);
          }
        } else if (v.options.length > 0) {
          issues.push(`${label} is ${v.kind} but has options.`);
        }
        if (section?.objective && v.kind === "descriptive") issues.push(`${label} is descriptive in an objective section.`);
        if (section && !section.objective && v.kind === "numerical") {
          issues.push(`${label} is numerical in a written section; it should be descriptive.`);
        }
        if (v.figure && (v.figure.box.length !== 4 || v.figure.box.some((x) => x < 0 || x > 1))) {
          issues.push(`${label} has a diagram box outside the page.`);
        }
      }
    }
    if (section && !whole && Math.abs(marks - section.marksEach) > 1e-9) {
      issues.push(`Question ${n}'s parts add up to ${marks} marks; its section gives ${section.marksEach}.`);
    }
    total += whole ? parts.get("")![0].marks : marks;
  }
  if (Math.abs(total - outline.maxMarks) > 1e-9) issues.push(`Marks add up to ${total}; the paper says ${outline.maxMarks}.`);
  return issues;
}
