import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Call, type Reply } from "@/test/fake-db";

vi.mock("server-only", () => ({}));
let respond: (c: Call) => Reply = () => ({});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeDb((c) => respond(c)).db }));
afterEach(() => {
  respond = () => ({});
});

const { getPaper, listPapers, listSubjects } = await import("./papers");
const subjects = { name: "Physics", exams: { name: "CBSE Class 12" } };

describe("listPapers", () => {
  it("flattens subject and exam names", async () => {
    respond = () => ({ data: [{ id: "p1", year: 2026, variant: "55/1/1", status: "collected", subjects }] });
    expect(await listPapers()).toEqual([
      { id: "p1", year: 2026, variant: "55/1/1", status: "collected", subject: "Physics", exam: "CBSE Class 12" },
    ]);
  });
  it("raises database errors", async () => {
    respond = () => ({ error: { message: "x" } });
    await expect(listPapers()).rejects.toThrow("x");
  });
});

describe("listSubjects", () => {
  it("labels subjects with their exam, sorted", async () => {
    respond = () => ({
      data: [
        { id: "2", name: "Physics", exams: { name: "NEET" } },
        { id: "1", name: "Physics", exams: { name: "CBSE Class 12" } },
      ],
    });
    expect(await listSubjects()).toEqual([
      { id: "1", label: "CBSE Class 12 · Physics" },
      { id: "2", label: "NEET · Physics" },
    ]);
  });
  it("raises database errors", async () => {
    respond = () => ({ error: { message: "x" } });
    await expect(listSubjects()).rejects.toThrow("x");
  });
});

describe("getPaper", () => {
  const paper = {
    id: "p1", year: 2026, variant: "55/1/1", status: "extracted", source_pdf_path: "uploads/a.pdf",
    max_marks: 70, duration_minutes: 180, subjects,
    sections: [
      { id: "s2", position: 2, title: "B", marks_correct: 2, questions: [] },
      {
        id: "s1", position: 1, title: "A", marks_correct: 1,
        questions: [
          { id: "q2", position: 2, label: "2", kind: "mcq_single", stem: "two", marks: 1, figure: null, options: [] },
          { id: "q1", position: 1, label: "1", kind: "mcq_single", stem: "one", marks: 1, figure: null,
            options: [{ label: "B", body: "b" }, { label: "A", body: "a" }] },
        ],
      },
    ],
  };

  it("returns sections, questions and options in order, with open flags", async () => {
    respond = (c) => (c.target === "papers" ? { data: paper } : { data: [{ reason: "Question 3 is missing." }] });
    const detail = (await getPaper("p1"))!;
    expect(detail.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(detail.sections[0].questions.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(detail.sections[0].questions[0].options.map((o) => o.label)).toEqual(["A", "B"]);
    expect(detail).toMatchObject({ subject: "Physics", exam: "CBSE Class 12", sourcePdfPath: "uploads/a.pdf", maxMarks: 70, durationMinutes: 180 });
    expect(detail.flags).toEqual(["Question 3 is missing."]);
  });
  it("is null for an unknown paper", async () => {
    respond = () => ({ data: null });
    expect(await getPaper("nope")).toBeNull();
  });
  it("raises database errors", async () => {
    respond = () => ({ error: { message: "x" } });
    await expect(getPaper("p1")).rejects.toThrow("x");
    respond = (c) => (c.target === "papers" ? { data: paper } : { error: { message: "flags" } });
    await expect(getPaper("p1")).rejects.toThrow("flags");
  });
});
