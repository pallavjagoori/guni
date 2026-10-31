import { afterEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
vi.mock("next/navigation", () => ({ redirect }));
const signInWithPassword = vi.fn(async (_credentials: object) => ({ error: null as object | null }));
const signOutFn = vi.fn(async () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword, signOut: signOutFn } }),
}));
const getCurrentUser = vi.fn(async () => ({ role: "admin" }) as { role: string } | null);
vi.mock("@/lib/auth", () => ({ getCurrentUser }));

afterEach(() => vi.clearAllMocks());
const { signIn, signOut } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("signIn", () => {
  it("asks for both fields", async () => {
    expect(await signIn({}, form({ email: "nope" }))).toEqual({ error: "Enter your email and password." });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it("reports a wrong password without saying which part was wrong", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    expect(await signIn({}, form({ email: "a@b.co", password: "x" }))).toEqual({ error: "That email and password don't match." });
  });
  it("sends admins to the admin area", async () => {
    await expect(signIn({}, form({ email: "a@b.co", password: "x" }))).rejects.toThrow("redirect:/admin");
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "x" });
  });
  it("sends students home", async () => {
    getCurrentUser.mockResolvedValueOnce({ role: "student" });
    await expect(signIn({}, form({ email: "a@b.co", password: "x" }))).rejects.toThrow("redirect:/");
    getCurrentUser.mockResolvedValueOnce(null);
    await expect(signIn({}, form({ email: "a@b.co", password: "x" }))).rejects.toThrow("redirect:/");
  });
});

describe("signOut", () => {
  it("ends the session and goes home", async () => {
    await expect(signOut()).rejects.toThrow("redirect:/");
    expect(signOutFn).toHaveBeenCalled();
  });
});
