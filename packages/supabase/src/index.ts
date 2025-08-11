import { config as loadEnv } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;

// validation
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase credentials. Please check your environment variables."
  );
}
export const supabase = createClient(supabaseUrl, supabaseKey);
