import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Call, type Reply } from "@/test/fake-db";

let user: { role: string } | null = { role: "admin" };
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => user }));
vi.mock("@/lib/ai/client", () => ({ anthropic: () => ({}) }));

let respond: (c: Call) => Reply = () => ({});
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => fakeDb((c) => respond(c)).db }));

const outline = {
  totalQuestions: 1, maxMarks: 1, durationMinutes: 180,
  sections: [{ title: "Section A", firstQuestion: 1, lastQuestion: 1, marksEach: 1, objective: true, instructions: "" }],
};
const run = (data: object) => ({ data, model: "m", usage: { input_tokens: 1, output_tokens: 1 }, costUsd: 0.01 });
const extractOutline = vi.fn(async () => run(outline));
const extractSection = vi.fn(async () => run({ questions: [{}, {}] }));
const checkExtraction = vi.fn(() => ["Question 1 is missing."]);
vi.mock("@/lib/import/extract", () => ({ PROMPT_VERSION: "v", extractOutline, extractSection, checkExtraction }));
const save = {
  saveOutline: vi.fn(async () => {}),
  saveSection: vi.fn(async () => {}),
  logRun: vi.fn(async () => "r"),
  flagPaper: vi.fn(async () => {}),
  loadExtraction: vi.fn(async () => ({ outline, questions: [] })),
};
vi.mock("@/lib/import/save", () => save);

afterEach(() => {
  user = { role: "admin" };
  respond = () => ({});
  vi.clearAllMocks();
});

const { POST, maxDuration } = await import("./route");
const call = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), {
    params: Promise.resolve({ id: "p1" }),
  } as never);
const pdf = { arrayBuffer: async () => new TextEncoder().encode("%PDF").buffer };
const withPaper = (extra: (c: Call) => Reply = () => ({})) => (c: Call): Reply => {
  if (c.target === "papers" && c.ops.some((o) => o.method === "maybeSingle")) {
    return { data: { id: "p1", source_pdf_path: "uploads/a.pdf", status: "collected" } };
  }
  if (c.target === "storage:papers") return { data: pdf };
  return extra(c);
};

describe("POST extract", () => {
  it("allows up to five minutes per step", () => expect(maxDuration).toBe(300));

  it("requires an admin", async () => {
    user = null;
    expect((await call({ step: "check" })).status).toBe(401);
    user = { role: "student" };
    expect((await call({ step: "check" })).status).toBe(403);
  });

  it("rejects unknown steps and bad JSON", async () => {
    expect((await call({ step: "nope" })).status).toBe(400);
    expect((await call("{")).status).toBe(400);
  });

  it("404s for an unknown paper", async () => {
    expect((await call({ step: "check" })).status).toBe(404);
  });

  it("refuses to re-extract a paper that is past extraction", async () => {
    respond = (c) => (c.target === "papers" ? { data: { id: "p1", source_pdf_path: "uploads/a.pdf", status: "ready" } } : {});
    expect((await call({ step: "outline" })).status).toBe(409);
    expect(extractOutline).not.toHaveBeenCalled();
  });

  it("records the AI cost even when saving fails", async () => {
    respond = withPaper();
    save.saveSection.mockRejectedValueOnce(new Error("insert failed"));
    expect((await call({ step: "section", position: 1 })).status).toBe(500);
    expect(save.logRun).toHaveBeenCalled();
  });

  it("reads the outline from the PDF and saves it", async () => {
    respond = withPaper();
    const res = await call({ step: "outline" });
    expect(await res.json()).toEqual({ sections: 1, costUsd: 0.01 });
    expect((extractOutline.mock.calls[0] as unknown[])[1]).toBe(Buffer.from("%PDF").toString("base64"));
    expect(save.saveOutline).toHaveBeenCalledWith(expect.anything(), "p1", outline);
    expect(save.logRun).toHaveBeenCalled();
  });

  it("transcribes one section", async () => {
    respond = withPaper();
    const res = await call({ step: "section", position: 1 });
    expect(await res.json()).toEqual({ questions: 2, costUsd: 0.01 });
    expect(save.saveSection).toHaveBeenCalledWith(expect.anything(), "p1", 1, [{}, {}]);
  });

  it("404s for a section the outline doesn't have", async () => {
    respond = withPaper();
    expect((await call({ step: "section", position: 2 })).status).toBe(404);
  });

  it("checks the saved result, flags issues and marks the paper extracted", async () => {
    respond = withPaper();
    const res = await call({ step: "check" });
    expect(await res.json()).toEqual({ issues: ["Question 1 is missing."] });
    expect(save.flagPaper).toHaveBeenCalledWith(expect.anything(), "p1", ["Question 1 is missing."]);
  });

  it("reports a failed status update", async () => {
    respond = withPaper((c) => (c.target === "papers" ? { error: { message: "update failed" } } : {}));
    const res = await call({ step: "check" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "update failed" });
  });

  it("needs a PDF before reading", async () => {
    respond = (c) => (c.target === "papers" ? { data: { id: "p1", source_pdf_path: null, status: "extracted" } } : {});
    expect((await call({ step: "outline" })).status).toBe(409);
  });

  it("reports download and AI failures", async () => {
    respond = (c) => (c.target === "storage:papers" ? { error: { message: "missing file" } } : withPaper()(c));
    expect(await (await call({ step: "outline" })).json()).toEqual({ error: "missing file" });
    respond = withPaper();
    extractOutline.mockRejectedValueOnce(new Error("Extraction stopped early (max_tokens)"));
    expect((await call({ step: "outline" })).status).toBe(500);
  });
});
