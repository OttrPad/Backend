// Create an admin client using the service role key (bypasses RLS)
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // set in Backend/.env
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);