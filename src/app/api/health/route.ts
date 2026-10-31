import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { supabasePublicKey, supabaseServiceKey, supabaseUrl } from "@/lib/supabase/env";

function isSet(read: () => string): boolean {
  try {
    read();
    return true;
  } catch {
    return false;
  }
}

// Reports whether configuration is present and the database answers. Never returns values.
export async function GET() {
  // Run at request time, never prerendered at build (when no settings exist yet).
  await connection();
  const config = {
    supabaseUrl: isSet(supabaseUrl),
    supabasePublicKey: isSet(supabasePublicKey),
    supabaseServiceKey: isSet(supabaseServiceKey),
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  };

  let database: "ok" | "unreachable" | "not_configured" = "not_configured";
  let migrated = false;
  if (config.supabaseUrl && config.supabaseServiceKey) {
    const { count, error } = await createAdminClient()
      .from("chapters")
      .select("id", { count: "exact", head: true });
    database = error ? "unreachable" : "ok";
    migrated = !error && (count ?? 0) > 0;
  }

  const ok = Object.values(config).every(Boolean) && database === "ok" && migrated;
  return Response.json({ ok, config, database, migrated }, { status: ok ? 200 : 503 });
}
