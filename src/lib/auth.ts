import "server-only";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: "student" | "admin";
}

// The signed-in user, verified from the session token, with their profile. Null when signed out.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", claims.sub)
    .single();
  if (!profile) return null;
  return { id: claims.sub, email: claims.email ?? "", displayName: profile.display_name, role: profile.role };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return user;
}

// First-run setup is open only until the first admin exists.
export async function adminExists(): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
