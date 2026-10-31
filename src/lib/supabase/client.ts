import { createBrowserClient } from "@supabase/ssr";
import { browserSupabaseConfig } from "./env";

export function createClient() {
  const { url, key } = browserSupabaseConfig();
  return createBrowserClient(url, key);
}
