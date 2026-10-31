import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Reply } from "@/test/fake-db";

const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
vi.mock("next/navigation", () => ({ redirect }));
const adminExists = vi.fn(async () => false);
vi.mock("@/lib/auth", () => ({ adminExists }));
const deleteUser = vi.fn(async (_id: string) => ({}));
const createUser = vi.fn(async (_attributes: object) => ({ data: { user: { id: "u1" } }, error: null as { message: string } | null }));
let profileReply: Reply = {};
const signInWithPassword = vi.fn(async () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => fakeDb(() => profileReply, { admin: { createUser, deleteUser } }).db,
  createClient: async () => ({ auth: { signInWithPassword } }),
}));

afterEach(() => {
  profileReply = {};
  vi.clearAllMocks();
});
const { createFirstAdmin } = await import("./actions");
const valid = () => {
  const f = new FormData();
  f.set("name", "Pallav");
  f.set("email", "p@example.com");
  f.set("password", "long-enough-pw");
  return f;
};

describe("createFirstAdmin", () => {
  it("is closed once an admin exists", async () => {
    adminExists.mockResolvedValueOnce(true);
    await expect(createFirstAdmin({}, valid())).rejects.toThrow("redirect:/login");
    expect(createUser).not.toHaveBeenCalled();
  });
  it("needs a name, email and a 10-character password", async () => {
    const f = valid();
    f.set("password", "short");
    expect((await createFirstAdmin({}, f)).error).toMatch(/at least 10 characters/);
  });
  it("creates a confirmed user, makes them admin and signs them in", async () => {
    await expect(createFirstAdmin({}, valid())).rejects.toThrow("redirect:/admin");
    expect(createUser).toHaveBeenCalledWith({
      email: "p@example.com", password: "long-enough-pw", email_confirm: true, user_metadata: { display_name: "Pallav" },
    });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "p@example.com", password: "long-enough-pw" });
  });
  it("reports a failed account creation", async () => {
    createUser.mockResolvedValueOnce({ data: { user: { id: "" } }, error: { message: "exists" } });
    expect(await createFirstAdmin({}, valid())).toEqual({ error: "exists" });
  });
  it("reports a failed role change", async () => {
    profileReply = { error: { message: "denied" } };
    expect(await createFirstAdmin({}, valid())).toEqual({ error: "denied" });
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });
});
