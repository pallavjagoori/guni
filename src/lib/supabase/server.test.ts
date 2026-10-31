import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookieStore = {
  getAll: vi.fn(() => [{ name: "sb", value: "token" }]),
  set: vi.fn(),
};
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

type CookieMethods = {
  getAll: () => unknown;
  setAll: (c: { name: string; value: string; options: object }[]) => void;
};
let cookieMethods: CookieMethods | undefined;
const createServerClient = vi.fn((_url: string, _key: string, opts: { cookies: CookieMethods }) => {
  cookieMethods = opts.cookies;
  return { kind: "server" };
});
vi.mock("@supabase/ssr", () => ({ createServerClient }));

const createServiceClient = vi.fn(() => ({ kind: "service" }));
vi.mock("@supabase/supabase-js", () => ({ createClient: createServiceClient }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("createClient (server)", () => {
  it("acts as the signed-in user via request cookies", async () => {
    const { createClient } = await import("./server");
    expect(await createClient()).toEqual({ kind: "server" });
    expect(createServerClient).toHaveBeenCalledWith("https://x.supabase.co", "anon", expect.any(Object));
    expect(cookieMethods!.getAll()).toEqual([{ name: "sb", value: "token" }]);
  });

  it("writes refreshed session cookies", async () => {
    const { createClient } = await import("./server");
    await createClient();
    cookieMethods!.setAll([{ name: "sb", value: "new", options: { path: "/" } }]);
    expect(cookieStore.set).toHaveBeenCalledWith("sb", "new", { path: "/" });
  });

  it("ignores cookie writes where cookies are read-only", async () => {
    const { createClient } = await import("./server");
    await createClient();
    cookieStore.set.mockImplementationOnce(() => {
      throw new Error("read-only");
    });
    expect(() => cookieMethods!.setAll([{ name: "sb", value: "new", options: {} }])).not.toThrow();
  });
});

describe("createAdminClient", () => {
  it("uses the service role key without persisting a session", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    const { createAdminClient } = await import("./server");
    expect(createAdminClient()).toEqual({ kind: "service" });
    expect(createServiceClient).toHaveBeenCalledWith("https://x.supabase.co", "service", {
      auth: { persistSession: false },
    });
  });

  it("fails loudly when the service role key is missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createAdminClient } = await import("./server");
    expect(() => createAdminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
