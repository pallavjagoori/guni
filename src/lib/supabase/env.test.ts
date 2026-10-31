import { afterEach, describe, expect, it, vi } from "vitest";
import { supabasePublicKey, supabaseUrl } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("supabaseUrl", () => {
  it("returns the configured URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    expect(supabaseUrl()).toBe("https://x.supabase.co");
  });
  it("fails loudly when the URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => supabaseUrl()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("supabasePublicKey", () => {
  it("prefers the publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pub");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(supabasePublicKey()).toBe("pub");
  });
  it("falls back to the anon key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(supabasePublicKey()).toBe("anon");
  });
  it("falls back to the anon key when the publishable key is empty", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(supabasePublicKey()).toBe("anon");
  });
  it("fails loudly when neither key is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
    expect(() => supabasePublicKey()).toThrow(/PUBLISHABLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
