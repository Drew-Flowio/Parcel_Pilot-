import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  // We don't throw at import-time so `next build` doesn't fail in CI without env.
  // Server code that actually queries should rely on getSupabaseServer().
  console.warn(
    "[parcel-pilot] Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
  );
}

export function getSupabaseServer() {
  return createClient(url ?? "", serviceKey ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
