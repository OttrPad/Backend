import { createClient } from "@supabase/supabase-js";

// Get environment variables (should be loaded by root dotenv-cli)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Validation with helpful error messages
if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Supabase configuration missing:");
  console.error("   SUPABASE_URL:", !!supabaseUrl ? "✅ Set" : "❌ Missing");
  console.error("   SUPABASE_KEY:", !!supabaseKey ? "✅ Set" : "❌ Missing");
  console.error("");
  console.error("💡 Make sure you have:");
  console.error("   1. Created .env file in the root directory");
  console.error("   2. Added your Supabase credentials");
  console.error('   3. Started with "pnpm dev" (uses dotenv-cli)');

  throw new Error(
    "Missing Supabase credentials. Please check your environment variables."
  );
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

// Export a test function for connectivity verification
export const testSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from("Rooms").select("count");
    if (error) throw error;
    return { success: true, message: "Supabase connection successful" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};
