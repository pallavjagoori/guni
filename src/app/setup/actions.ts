"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { adminExists } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { FormState } from "../login/actions";

const firstAdmin = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  password: z.string().min(10),
});

// Creates the first admin account. Closed for good once any admin exists.
export async function createFirstAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  if (await adminExists()) redirect("/login");
  const parsed = firstAdmin.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your name, email and a password of at least 10 characters." };
  const { name, email, password } = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) return { error: error.message };
  const { error: roleError } = await admin.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  if (roleError) return { error: roleError.message };

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  redirect("/admin");
}
