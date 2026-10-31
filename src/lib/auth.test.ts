import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Reply } from "@/test/fake-db";

vi.mock("server-only", () => ({}));
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
vi.mock("next/navigation", () => ({ redirect }));

let claims: object | null = null;
let profileReply: Reply = {};
let adminReply: Reply = {};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeDb(() => profileReply, { getClaims: async () => ({ data: claims ? { claims } : null }) }).db,
  createAdminClient: () => fakeDb(() => adminReply).db,
}));

afterEach(() => {
  claims = null;
  profileReply = {};
  vi.clearAllMocks();
});

const { adminExists, getCurrentUser, requireAdmin } = await import("./auth");

describe("getCurrentUser", () => {
  it("is null when signed out", async () => {
    expect(await getCurrentUser()).toBeNull();
  });
  it("is null when the profile is missing", async () => {
    claims = { sub: "u1", email: "a@b.c" };
    expect(await getCurrentUser()).toBeNull();
  });
  it("combines the verified claims with the profile", async () => {
    claims = { sub: "u1", email: "a@b.c" };
    profileReply = { data: { display_name: "Pallav", role: "admin" } };
    expect(await getCurrentUser()).toEqual({ id: "u1", email: "a@b.c", displayName: "Pallav", role: "admin" });
  });
  it("tolerates a token without an email", async () => {
    claims = { sub: "u1" };
    profileReply = { data: { display_name: "Kid", role: "student" } };
    expect((await getCurrentUser())!.email).toBe("");
  });
});

describe("requireAdmin", () => {
  it("sends signed-out visitors to sign in", async () => {
    await expect(requireAdmin()).rejects.toThrow("redirect:/login");
  });
  it("sends students home", async () => {
    claims = { sub: "u1" };
    profileReply = { data: { display_name: "Kid", role: "student" } };
    await expect(requireAdmin()).rejects.toThrow("redirect:/");
  });
  it("returns the admin", async () => {
    claims = { sub: "u1" };
    profileReply = { data: { display_name: "Pallav", role: "admin" } };
    expect((await requireAdmin()).role).toBe("admin");
  });
});

describe("adminExists", () => {
  it("counts admin profiles", async () => {
    adminReply = { count: 1 };
    expect(await adminExists()).toBe(true);
    adminReply = { count: 0 };
    expect(await adminExists()).toBe(false);
    adminReply = { count: null };
    expect(await adminExists()).toBe(false);
  });
  it("raises database errors", async () => {
    adminReply = { error: { message: "down" } };
    await expect(adminExists()).rejects.toThrow("down");
  });
});
