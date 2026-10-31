import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, op, type Call, type Reply } from "@/test/fake-db";

const requireAdmin = vi.fn(async () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin }));
let respond: (c: Call) => Reply = () => ({});
let calls: Call[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => {
    const fake = fakeDb((c) => respond(c));
    calls = fake.calls;
    return fake.db;
  },
}));
afterEach(() => {
  respond = () => ({});
  vi.clearAllMocks();
});
const { createPaper, prepareUpload } = await import("./actions");

const path = "uploads/123e4567-e89b-12d3-a456-426614174000.pdf";
const input = { subjectId: "123e4567-e89b-12d3-a456-426614174001", year: 2026, variant: "55/1/1", path };

describe("prepareUpload", () => {
  it("returns a one-time upload URL token for a fresh path", async () => {
    respond = () => ({ data: { token: "t" } });
    const result = await prepareUpload();
    expect(result).toMatchObject({ token: "t" });
    expect((result as { path: string }).path).toMatch(/^uploads\/[0-9a-f-]{36}\.pdf$/);
    expect(requireAdmin).toHaveBeenCalled();
  });
  it("reports storage errors", async () => {
    respond = () => ({ error: { message: "no bucket" } });
    expect(await prepareUpload()).toEqual({ error: "no bucket" });
  });
});

describe("createPaper", () => {
  const uploaded = (c: Call): Reply =>
    c.target === "storage:papers" ? { data: [{ name: path.slice(8) }] } : { data: { id: "p1" } };

  it("rejects bad input, including paths outside uploads", async () => {
    expect(await createPaper({ ...input, path: "../x.pdf" })).toEqual({ error: "Choose a subject, a year and a PDF." });
  });
  it("needs the uploaded file to exist", async () => {
    respond = (c) => (c.target === "storage:papers" ? { data: [] } : {});
    expect(await createPaper(input)).toEqual({ error: "The PDF didn't finish uploading. Try again." });
  });
  it("reports storage errors", async () => {
    respond = () => ({ error: { message: "storage down" } });
    expect(await createPaper(input)).toEqual({ error: "storage down" });
  });
  it("creates the paper with placeholder duration and marks", async () => {
    respond = uploaded;
    expect(await createPaper(input)).toEqual({ id: "p1" });
    expect(op(calls[1], "insert")!.args[0]).toEqual({
      subject_id: input.subjectId, year: 2026, variant: "55/1/1", duration_minutes: 0, max_marks: 0, source_pdf_path: path,
    });
  });
  it("explains duplicates and passes other errors through", async () => {
    respond = (c) => (c.target === "papers" ? { error: { message: "dup", code: "23505" } } : uploaded(c));
    expect(await createPaper(input)).toEqual({ error: "This paper is already imported." });
    respond = (c) => (c.target === "papers" ? { error: { message: "other" } } : uploaded(c));
    expect(await createPaper(input)).toEqual({ error: "other" });
  });
});
