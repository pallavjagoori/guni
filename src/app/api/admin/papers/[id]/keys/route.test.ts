import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Call, type Reply } from "@/test/fake-db";

let user: { role: string } | null = { role: "admin" };
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => user }));
vi.mock("@/lib/ai/client", () => ({ anthropic: () => ({}) }));
let respond: (c: Call) => Reply = () => ({});
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => fakeDb((c) => respond(c)).db }));

const run = { data: { answers: [{}, {}] }, model: "m", usage: { input_tokens: 1, output_tokens: 1 }, costUsd: 0.02 };
const readKeys = vi.fn(async (..._args: unknown[]) => run);
const checkKeys = vi.fn(() => ["Question 2 has no answer in the marking scheme."]);
vi.mock("@/lib/import/keys", () => ({ KEYS_PROMPT_VERSION: "k", KEYS_FLAG_PREFIX: "Answer keys: ", readKeys, checkKeys }));
const logRun = vi.fn(async () => "r");
const flagPaper = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/import/save", () => ({ logRun, flagPaper }));
const targets = [{ id: "q1" }];
const loadTargets = vi.fn(async (..._args: unknown[]) => targets as object[]);
const loadAnswers = vi.fn(async () => []);
const saveKeys = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/import/save-keys", () => ({ loadTargets, loadAnswers, saveKeys }));

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
const ready = (c: Call): Reply => {
  if (c.target === "papers") return { data: { id: "p1", variant: "55/1/1", marking_scheme_pdf_path: "uploads/ms.pdf" } };
  if (c.target === "storage:papers") return { data: pdf };
  return {};
};

describe("POST keys", () => {
  it("allows five minutes per step", () => expect(maxDuration).toBe(300));

  it("requires an admin and a valid step", async () => {
    user = null;
    expect((await call({ step: "check" })).status).toBe(401);
    user = { role: "student" };
    expect((await call({ step: "check" })).status).toBe(403);
    user = { role: "admin" };
    expect((await call({ step: "outline" })).status).toBe(400);
    expect((await call("{")).status).toBe(400);
  });

  it("needs the paper and its marking scheme", async () => {
    expect((await call({ step: "check" })).status).toBe(404);
    respond = () => ({ data: { id: "p1", variant: "", marking_scheme_pdf_path: null } });
    expect((await call({ step: "check" })).status).toBe(409);
  });

  it("reads one section's answers for the paper's set, logs cost and saves", async () => {
    respond = ready;
    expect(await (await call({ step: "section", position: 2 })).json()).toEqual({ answers: 2, costUsd: 0.02 });
    expect(loadTargets.mock.calls[0].slice(1)).toEqual(["p1", 2]);
    expect(readKeys.mock.calls[0].slice(1)).toEqual([Buffer.from("%PDF").toString("base64"), "55/1/1", targets]);
    expect(logRun).toHaveBeenCalled();
    expect(saveKeys.mock.calls[0].slice(1)).toEqual([targets, [{}, {}]]);
  });

  it("skips sections without questions", async () => {
    respond = ready;
    loadTargets.mockResolvedValueOnce([]);
    expect(await (await call({ step: "section", position: 1 })).json()).toEqual({ answers: 0, costUsd: 0 });
    expect(readKeys).not.toHaveBeenCalled();
  });

  it("checks all answers and flags problems under its own prefix", async () => {
    respond = ready;
    expect(await (await call({ step: "check" })).json()).toEqual({ issues: ["Question 2 has no answer in the marking scheme."] });
    expect(flagPaper.mock.calls[0].slice(1)).toEqual(["p1", ["Question 2 has no answer in the marking scheme."], "Answer keys: "]);
  });

  it("reports download failures", async () => {
    respond = (c) => (c.target === "storage:papers" ? { error: { message: "gone" } } : ready(c));
    const res = await call({ step: "section", position: 1 });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "gone" });
  });
});
