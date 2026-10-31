import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublicKey, supabaseServiceKey, supabaseUrl } from "./env";

/** Acts as the signed-in user: row level security applies. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. src/proxy.ts refreshes sessions.
        }
      },
    },
  });
}

/** Bypasses row level security. Only for background jobs (content pipeline, rough-work review). */
export function createAdminClient() {
  return createServiceClient(supabaseUrl(), supabaseServiceKey(), { auth: { persistSession: false } });
}
