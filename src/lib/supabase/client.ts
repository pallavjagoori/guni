import { createBrowserClient } from "@supabase/ssr";
import { browserSupabaseConfig } from "./env";

/** Supabase client for the browser, acting as the signed-in user. */
export function createClient() {
  const { url, key } = browserSupabaseConfig();
  return createBrowserClient(url, key);
}
