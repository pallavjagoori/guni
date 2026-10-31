"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** What a sign-in attempt returns to its form. */
export interface FormState {
  error?: string;
}

const credentials = z.object({ email: z.email(), password: z.string().min(1) });

/**
 * Signs in with email and password, then sends admins to /admin and everyone else home.
 * @returns An error message for the form when sign-in fails.
 */
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "That email and password don't match." };
  const user = await getCurrentUser();
  redirect(user?.role === "admin" ? "/admin" : "/");
}

/** Signs the current user out and returns to the home page. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
