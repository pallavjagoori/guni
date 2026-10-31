import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { browserSupabaseConfig, supabasePublicKey, supabaseServiceKey, supabaseUrl } from "@/lib/supabase/env";

// Postgres "undefined table" and PostgREST "table not in schema cache": the database
// answered, but the migrations have not created the tables yet.
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

function isSet(read: () => unknown): boolean {
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
    browserConfig: isSet(browserSupabaseConfig),
    supabaseServiceKey: isSet(supabaseServiceKey),
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  };

  let database: "ok" | "unreachable" | "not_configured" = "not_configured";
  let migrated = false;
  if (config.supabaseUrl && config.supabaseServiceKey) {
    const { count, error } = await createAdminClient()
      .from("chapters")
      .select("id", { count: "exact", head: true });
    database = error && !MISSING_TABLE.has(error.code ?? "") ? "unreachable" : "ok";
    migrated = !error && (count ?? 0) > 0;
  }

  const ok = Object.values(config).every(Boolean) && database === "ok" && migrated;
  return Response.json({ ok, config, database, migrated }, { status: ok ? 200 : 503 });
}
