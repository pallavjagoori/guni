// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { ExtractButton } = await import("./extract-button");

type Reply = { ok?: boolean; status?: number; body: object | null };
let replies: Reply[] = [];
const fetchMock = vi.fn(async (..._args: unknown[]) => {
  const r = replies.shift()!;
  return {
    ok: r.ok ?? true,
    status: r.status ?? 200,
    json: async () => {
      if (r.body === null) throw new SyntaxError("Unexpected token <");
      return r.body;
    },
  };
});
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ExtractButton", () => {
  it("runs outline, every section, then the check, and totals the cost", async () => {
    replies = [
      { body: { sections: 2, costUsd: 0.01 } },
      { body: { questions: 16, costUsd: 0.02 } },
      { body: { questions: 5, costUsd: 0.03 } },
      { body: { issues: [] } },
    ];
    render(<ExtractButton paperId="p1" hasQuestions={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Extract questions" }));
    expect(await screen.findByText("Done for $0.060. No problems found.")).toBeDefined();
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
    expect(bodies).toEqual([{ step: "outline" }, { step: "section", position: 1 }, { step: "section", position: 2 }, { step: "check" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/papers/p1/extract");
    expect(refresh).toHaveBeenCalled();
  });

  it("says how many problems were flagged", async () => {
    replies = [{ body: { sections: 0, costUsd: 0.01 } }, { body: { issues: ["a", "b"] } }];
    render(<ExtractButton paperId="p1" hasQuestions />);
    await userEvent.click(screen.getByRole("button", { name: "Extract again" }));
    expect(await screen.findByText("Done for $0.010. 2 problem(s) flagged below.")).toBeDefined();
  });

  it("stops and shows the server's error", async () => {
    replies = [{ ok: false, status: 500, body: { error: "Extraction stopped early (max_tokens)" } }];
    render(<ExtractButton paperId="p1" hasQuestions={false} />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Stopped: Extraction stopped early (max_tokens)")).toBeDefined();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
  });

  it("falls back to the status code when the error has no message", async () => {
    replies = [{ ok: false, status: 504, body: null }];
    render(<ExtractButton paperId="p1" hasQuestions={false} />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Stopped: Request failed (504)")).toBeDefined();
  });
});
