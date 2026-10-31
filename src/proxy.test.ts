import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SetAll = (
  c: { name: string; value: string; options: object }[],
  headers: Record<string, string>,
) => void;
let captured: { getAll: () => unknown; setAll: SetAll } | undefined;
const getClaims = vi.fn(async () => {});

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_u: string, _k: string, opts: { cookies: { getAll: () => unknown; setAll: SetAll } }) => {
    captured = opts.cookies;
    return { auth: { getClaims } };
  }),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});
afterEach(() => {
  vi.unstubAllEnvs();
  getClaims.mockReset();
});

describe("proxy", () => {
  it("passes the request through and refreshes the session", async () => {
    const { proxy } = await import("./proxy");
    const req = new NextRequest("https://guni.app/", { headers: { cookie: "sb=old" } });
    const res = await proxy(req);
    expect(getClaims).toHaveBeenCalled();
    expect(captured!.getAll()).toEqual([{ name: "sb", value: "old" }]);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("writes refreshed cookies and no-cache headers to the response", async () => {
    getClaims.mockImplementationOnce(async () => {
      captured!.setAll([{ name: "sb", value: "new", options: { path: "/" } }], { "Cache-Control": "private, no-store" });
    });
    const { proxy } = await import("./proxy");
    const req = new NextRequest("https://guni.app/");
    const res = await proxy(req);
    expect(res.cookies.get("sb")?.value).toBe("new");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(req.cookies.get("sb")?.value).toBe("new");
  });

  it("skips static assets", async () => {
    const { config } = await import("./proxy");
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/exam/123")).toBe(true);
    expect(re.test("/_next/static/chunk.js")).toBe(false);
    expect(re.test("/logo.png")).toBe(false);
  });
});
