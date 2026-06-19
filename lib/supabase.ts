import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client. Uses the service role key, which bypasses RLS.
// This is intentional and safe because this client is never bundled into the
// browser — it is only imported by API route handlers (server runtime).
//
// All access scoping (which dealership can see which quotes) is enforced in
// the API route by validating the session JWT BEFORE querying.

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
