import { afterEach, describe, expect, it, vi } from "vitest";

const createBrowserClient = vi.fn(() => ({ kind: "browser" }));
vi.mock("@supabase/ssr", () => ({ createBrowserClient }));

afterEach(() => vi.unstubAllEnvs());

describe("createClient (browser)", () => {
  it("uses the project URL and public key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    const { createClient } = await import("./client");
    expect(createClient()).toEqual({ kind: "browser" });
    expect(createBrowserClient).toHaveBeenCalledWith("https://x.supabase.co", "anon");
  });
});
