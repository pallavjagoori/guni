import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
const notFound = vi.fn(() => {
  throw new Error("not-found");
});
vi.mock("next/navigation", () => ({ redirect, notFound, useRouter: () => ({}) }));
vi.mock("next/server", () => ({ connection: async () => {} }));
const adminExists = vi.fn(async () => false);
const requireAdmin = vi.fn(async () => ({ displayName: "Pallav", role: "admin" }));
vi.mock("@/lib/auth", () => ({ adminExists, requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({}));
vi.mock("@/lib/supabase/client", () => ({}));
const listPapers = vi.fn(async () => [] as object[]);
const listSubjects = vi.fn(async () => [{ id: "s1", label: "CBSE Class 12 · Physics" }]);
const getPaper = vi.fn(async () => null as object | null);
vi.mock("@/lib/admin/papers", () => ({ listPapers, listSubjects, getPaper }));

afterEach(() => vi.clearAllMocks());

describe("SetupGate", () => {
  it("shows the form until an admin exists", async () => {
    const { SetupGate } = await import("../setup/setup-gate");
    expect(renderToStaticMarkup(await SetupGate())).toContain("Create admin account");
    adminExists.mockResolvedValueOnce(true);
    await expect(SetupGate()).rejects.toThrow("redirect:/login");
  });
});

describe("PaperList", () => {
  it("shows an empty state", async () => {
    const { PaperList } = await import("./paper-list");
    const html = renderToStaticMarkup(await PaperList());
    expect(html).toContain("Signed in as Pallav");
    expect(html).toContain("No papers yet.");
  });
  it("links each paper", async () => {
    listPapers.mockResolvedValueOnce([
      { id: "p1", year: 2026, variant: "55/1/1", status: "extracted", subject: "Physics", exam: "CBSE Class 12" },
    ]);
    const { PaperList } = await import("./paper-list");
    const html = renderToStaticMarkup(await PaperList());
    expect(html).toContain('href="/admin/papers/p1"');
    expect(html).toContain("CBSE Class 12 Physics 2026 55/1/1");
  });
});

describe("NewPaperSection", () => {
  it("offers the subjects", async () => {
    const { NewPaperSection } = await import("./papers/new/new-paper-section");
    expect(renderToStaticMarkup(await NewPaperSection())).toContain("CBSE Class 12 · Physics");
    expect(requireAdmin).toHaveBeenCalled();
  });
});

describe("PaperView", () => {
  const params = Promise.resolve({ id: "p1" });
  const paper = {
    id: "p1", year: 2026, variant: "55/1/1", status: "extracted", subject: "Physics", exam: "CBSE Class 12",
    sourcePdfPath: "uploads/a.pdf", markingSchemePdfPath: null as string | null, maxMarks: 70, durationMinutes: 180, flags: [] as string[],
    sections: [
      {
        id: "s1", position: 1, title: "Section A", marksCorrect: 1,
        questions: [
          { id: "q1", position: 1, label: "1", kind: "mcq_single", stem: "Field?", marks: null, figure: { page: 5, caption: "c" }, options: [{ label: "A", body: "10 N/C" }], answer: "A", steps: [] as object[] },
          { id: "q2", position: 2, label: "2", kind: "descriptive", stem: "Explain", marks: 2, figure: null, options: [], answer: null,
            steps: [{ n: 1, text: "Lenz's law", marks: 1 }, { n: 2, text: "Direction", marks: 1 }] },
          { id: "q3", position: 3, label: "3", kind: "descriptive", stem: "Unanswered", marks: 2, figure: null, options: [], answer: null, steps: [] },
        ],
      },
    ],
  };

  it("404s for an unknown paper", async () => {
    const { PaperView } = await import("./papers/[id]/paper-view");
    await expect(PaperView({ params })).rejects.toThrow("not-found");
  });
  it("shows questions, options and diagrams", async () => {
    getPaper.mockResolvedValueOnce(paper);
    const { PaperView } = await import("./papers/[id]/paper-view");
    const html = renderToStaticMarkup(await PaperView({ params }));
    expect(html).toContain("3 questions · 70 marks · 180 minutes");
    expect(html).toContain("Answer: A");
    expect(html).toContain("Answer · 2 marking steps");
    expect(html).toContain("Lenz&#x27;s law");
    expect(html).toContain("Upload the official marking scheme PDF");
    expect(html).toContain('href="/api/admin/papers/p1/export"');
    expect(html).toContain("Q1 · mcq_single · 1 marks · diagram on page 5");
    expect(html).toContain("(A) 10 N/C");
    expect(html).toContain("Q2 · descriptive · 2 marks");
    expect(html).toContain("Extract again");
    expect(html).not.toContain("Needs a look");
  });
  it("lists flagged problems", async () => {
    getPaper.mockResolvedValueOnce({ ...paper, sections: [], flags: ["Question 3 is missing."] });
    const { PaperView } = await import("./papers/[id]/paper-view");
    const html = renderToStaticMarkup(await PaperView({ params }));
    expect(html).toContain("Question 3 is missing.");
    expect(html).toContain("Extract questions");
  });
});
