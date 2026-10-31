import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabasePublicKey, supabaseServiceKey, supabaseUrl } from "./env";

const NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
];

beforeEach(() => {
  for (const n of NAMES) vi.stubEnv(n, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("supabaseUrl", () => {
  it("prefers the public URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://pub.supabase.co");
    vi.stubEnv("SUPABASE_URL", "https://srv.supabase.co");
    expect(supabaseUrl()).toBe("https://pub.supabase.co");
  });
  it("falls back to the server URL, also when the public one is empty", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_URL", "https://srv.supabase.co");
    expect(supabaseUrl()).toBe("https://srv.supabase.co");
  });
  it("fails loudly when no URL is set", () => {
    expect(() => supabaseUrl()).toThrow(/NEXT_PUBLIC_SUPABASE_URL nor SUPABASE_URL/);
  });
});

describe("supabasePublicKey", () => {
  it.each([
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ["SUPABASE_PUBLISHABLE_KEY"],
    ["SUPABASE_ANON_KEY"],
  ])("reads %s", (name) => {
    vi.stubEnv(name, "k");
    expect(supabasePublicKey()).toBe("k");
  });
  it("prefers the public publishable key over the others", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pub");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(supabasePublicKey()).toBe("pub");
  });
  it("skips an empty publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(supabasePublicKey()).toBe("anon");
  });
  it("fails loudly when no key is set", () => {
    expect(() => supabasePublicKey()).toThrow(/publishable or anon key/);
  });
});

describe("supabaseServiceKey", () => {
  it("prefers the service role key", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "role");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    expect(supabaseServiceKey()).toBe("role");
  });
  it("falls back to the secret key", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    expect(supabaseServiceKey()).toBe("secret");
  });
  it("fails loudly when neither is set", () => {
    expect(() => supabaseServiceKey()).toThrow(/SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_SECRET_KEY/);
  });
});
