// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const prepareUpload = vi.fn(async () => ({ path: "uploads/x.pdf", token: "t" }) as object);
const createPaper = vi.fn(async (_input: object) => ({ id: "p1" }) as object);
vi.mock("./actions", () => ({ prepareUpload, createPaper }));
const uploadToSignedUrl = vi.fn(async (..._args: unknown[]) => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const { NewPaperForm } = await import("./new-paper-form");

async function fill() {
  render(<NewPaperForm subjects={[{ id: "s1", label: "CBSE Class 12 · Physics" }]} />);
  await userEvent.type(screen.getByLabelText("Year"), "2026");
  await userEvent.type(screen.getByLabelText(/Set or shift/), "55/1/1");
  const file = new File(["%PDF"], "paper.pdf", { type: "application/pdf" });
  await userEvent.upload(screen.getByLabelText("Question paper PDF"), file);
  // jsdom treats a required file input as empty even after upload, so submit directly.
  fireEvent.submit(screen.getByRole("button", { name: "Upload paper" }).closest("form")!);
  return file;
}

describe("NewPaperForm", () => {
  it("uploads the PDF, creates the paper and opens it", async () => {
    const file = await fill();
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/admin/papers/p1"));
    expect(uploadToSignedUrl).toHaveBeenCalledWith("uploads/x.pdf", "t", file, { contentType: "application/pdf" });
    expect(createPaper).toHaveBeenCalledWith({ subjectId: "s1", year: 2026, variant: "55/1/1", path: "uploads/x.pdf" });
  });

  it("shows why preparing the upload failed", async () => {
    prepareUpload.mockResolvedValueOnce({ error: "no bucket" });
    await fill();
    expect((await screen.findByRole("alert")).textContent).toBe("no bucket");
    expect(screen.getByRole("button", { name: "Upload paper" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows why the upload failed", async () => {
    uploadToSignedUrl.mockResolvedValueOnce({ error: { message: "too large" } });
    await fill();
    expect((await screen.findByRole("alert")).textContent).toBe("too large");
  });

  it("shows why creating the paper failed", async () => {
    createPaper.mockResolvedValueOnce({ error: "This paper is already imported." });
    await fill();
    expect((await screen.findByRole("alert")).textContent).toBe("This paper is already imported.");
    expect(push).not.toHaveBeenCalled();
  });
});
