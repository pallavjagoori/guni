// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const prepareUpload = vi.fn(async () => ({ path: "uploads/x.pdf", token: "t" }) as object);
vi.mock("../new/actions", () => ({ prepareUpload }));
const attachMarkingScheme = vi.fn(async (_i: object) => ({ ok: true }) as object);
vi.mock("./actions", () => ({ attachMarkingScheme }));
const uploadToSignedUrl = vi.fn(async (..._a: unknown[]) => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }) }));
const postStep = vi.fn(async (..._a: unknown[]) => ({}) as Record<string, unknown>);
vi.mock("./post-step", () => ({ postStep }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const { KeysPanel } = await import("./keys-panel");
const pdf = new File(["%PDF"], "ms.pdf", { type: "application/pdf" });

describe("KeysPanel", () => {
  it("uploads and attaches a marking scheme", async () => {
    render(<KeysPanel paperId="p1" sections={[1, 2]} hasScheme={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    await userEvent.upload(screen.getByLabelText("Upload the official marking scheme PDF"), pdf);
    expect(await screen.findByText("Marking scheme uploaded.")).toBeDefined();
    expect(uploadToSignedUrl).toHaveBeenCalledWith("uploads/x.pdf", "t", pdf, { contentType: "application/pdf" });
    expect(attachMarkingScheme).toHaveBeenCalledWith({ paperId: "p1", path: "uploads/x.pdf" });
    expect(refresh).toHaveBeenCalled();
  });

  it("ignores an empty file choice", async () => {
    render(<KeysPanel paperId="p1" sections={[1, 2]} hasScheme />);
    const input = screen.getByLabelText("Replace the marking scheme PDF");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(prepareUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["preparing", () => prepareUpload.mockResolvedValueOnce({ error: "no bucket" }), "no bucket"],
    ["uploading", () => uploadToSignedUrl.mockResolvedValueOnce({ error: { message: "too big" } }), "too big"],
    ["attaching", () => attachMarkingScheme.mockResolvedValueOnce({ error: "denied" }), "denied"],
  ])("reports a failure while %s", async (_step, fail, message) => {
    fail();
    render(<KeysPanel paperId="p1" sections={[1, 2]} hasScheme={false} />);
    await userEvent.upload(screen.getByLabelText(/marking scheme PDF/), pdf);
    expect(await screen.findByText(`Stopped: ${message}`)).toBeDefined();
  });

  it("reads keys section by section, then checks them", async () => {
    postStep
      .mockResolvedValueOnce({ answers: 16, costUsd: 0.01 })
      .mockResolvedValueOnce({ answers: 5, costUsd: 0.02 })
      .mockResolvedValueOnce({ issues: [] });
    render(<KeysPanel paperId="p1" sections={[1, 2]} hasScheme />);
    await userEvent.click(screen.getByRole("button", { name: "Read answer keys" }));
    expect(await screen.findByText("Done for $0.030. Every question has an answer.")).toBeDefined();
    expect(postStep.mock.calls.map((c) => c[1])).toEqual([{ step: "section", position: 1 }, { step: "section", position: 2 }, { step: "check" }]);
    expect(postStep.mock.calls[0][0]).toBe("/api/admin/papers/p1/keys");
  });

  it("lets the same file be chosen again after a failure", async () => {
    prepareUpload.mockResolvedValueOnce({ error: "no bucket" });
    render(<KeysPanel paperId="p1" sections={[1]} hasScheme={false} />);
    const input = screen.getByLabelText(/marking scheme PDF/) as HTMLInputElement;
    await userEvent.upload(input, pdf);
    await screen.findByText("Stopped: no bucket");
    expect(input.value).toBe("");
  });

  it("reports flagged problems and failures", async () => {
    postStep.mockResolvedValueOnce({ answers: 1, costUsd: 0.01 }).mockResolvedValueOnce({ issues: ["x"] });
    render(<KeysPanel paperId="p1" sections={[3]} hasScheme />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Done for $0.010. 1 problem(s) flagged below.")).toBeDefined();
    expect(postStep.mock.calls[0][1]).toEqual({ step: "section", position: 3 });
    postStep.mockRejectedValueOnce(new Error("timeout"));
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Stopped: timeout")).toBeDefined();
  });
});
