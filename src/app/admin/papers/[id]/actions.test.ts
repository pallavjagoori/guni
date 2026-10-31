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
const { attachMarkingScheme } = await import("./actions");
const path = "uploads/123e4567-e89b-12d3-a456-426614174000.pdf";
const input = { paperId: "123e4567-e89b-12d3-a456-426614174001", path };
const uploaded = (c: Call): Reply => (c.target === "storage:papers" ? { data: [{ name: path.slice(8) }] } : {});

describe("attachMarkingScheme", () => {
  it("rejects bad input", async () => {
    expect(await attachMarkingScheme({ ...input, path: "x.pdf" })).toEqual({ error: "Choose a PDF." });
    expect(requireAdmin).toHaveBeenCalled();
  });
  it("needs the upload to exist", async () => {
    respond = (c) => (c.target === "storage:papers" ? { data: [] } : {});
    expect(await attachMarkingScheme(input)).toEqual({ error: "The PDF didn't finish uploading. Try again." });
    respond = () => ({ error: { message: "storage down" } });
    expect(await attachMarkingScheme(input)).toEqual({ error: "storage down" });
  });
  it("links the scheme to the paper", async () => {
    respond = uploaded;
    expect(await attachMarkingScheme(input)).toEqual({ ok: true });
    expect(op(calls[1], "update")!.args[0]).toEqual({ marking_scheme_pdf_path: path });
  });
  it("reports update errors", async () => {
    respond = (c) => (c.target === "papers" ? { error: { message: "denied" } } : uploaded(c));
    expect(await attachMarkingScheme(input)).toEqual({ error: "denied" });
  });
});
