import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: () => ({ select }) }),
}));

beforeEach(() => {
  for (const n of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "ANTHROPIC_API_KEY"]) vi.stubEnv(n, undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  select.mockReset();
});

const configure = () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk");
};

describe("GET /api/health", () => {
  it("reports missing configuration without touching the database", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      config: { supabaseUrl: false, supabasePublicKey: false, supabaseServiceKey: false, anthropicKey: false },
      database: "not_configured",
      migrated: false,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("is healthy when configured, reachable and migrated", async () => {
    configure();
    select.mockResolvedValue({ count: 141, error: null });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, database: "ok", migrated: true });
  });

  it("reports an empty database as not migrated", async () => {
    configure();
    select.mockResolvedValue({ count: 0, error: null });
    const { GET } = await import("./route");
    expect(await (await GET()).json()).toMatchObject({ ok: false, database: "ok", migrated: false });
  });

  it("treats a missing count as not migrated", async () => {
    configure();
    select.mockResolvedValue({ count: null, error: null });
    const { GET } = await import("./route");
    expect(await (await GET()).json()).toMatchObject({ migrated: false });
  });

  it("reports an unreachable database", async () => {
    configure();
    select.mockResolvedValue({ count: null, error: { message: "relation does not exist" } });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ database: "unreachable", migrated: false });
  });
});
