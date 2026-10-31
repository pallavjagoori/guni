import { afterEach, describe, expect, it, vi } from "vitest";

let user: { role: string } | null = { role: "admin" };
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => user }));
const getPaper = vi.fn(async (_id: string) => null as object | null);
vi.mock("@/lib/admin/papers", () => ({ getPaper }));
afterEach(() => {
  user = { role: "admin" };
  vi.clearAllMocks();
});
const { GET } = await import("./route");
const call = () => GET(new Request("http://x"), { params: Promise.resolve({ id: "p1" }) } as never);

describe("GET export", () => {
  it("requires an admin", async () => {
    user = null;
    expect((await call()).status).toBe(401);
    user = { role: "student" };
    expect((await call()).status).toBe(403);
  });
  it("404s for an unknown paper", async () => {
    expect((await call()).status).toBe(404);
  });
  it("downloads the paper as a named JSON file", async () => {
    getPaper.mockResolvedValueOnce({ id: "p1", subject: "Physics", year: 2026, variant: "55/1/1" });
    const res = await call();
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Physics-2026-55_1_1.json"');
    expect(await res.json()).toMatchObject({ id: "p1" });
  });
});
