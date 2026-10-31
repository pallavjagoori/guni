// The Vercel Supabase integration sets these automatically. Browser code only sees
// NEXT_PUBLIC_* variables; server code can also fall back to the unprefixed names.
// `||`, not `??`: Vercel can define a variable with an empty value.
export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error("Neither NEXT_PUBLIC_SUPABASE_URL nor SUPABASE_URL is set");
  return url;
}

// Newer projects expose a "publishable" key; older ones call it the anon key.
export function supabasePublicKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("No Supabase publishable or anon key is set");
  return key;
}

// Server only. Bypasses row level security.
export function supabaseServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_SECRET_KEY is set");
  return key;
}

// Browser code: Next.js inlines only NEXT_PUBLIC_* values, so no server fallbacks here.
export function browserSupabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and a NEXT_PUBLIC_ publishable or anon key are required");
  }
  return { url, key };
}
