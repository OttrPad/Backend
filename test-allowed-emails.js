import { supabase } from "@packages/supabase";

// Test script to verify allowed_emails table structure and access
async function testAllowedEmailsTable() {
  console.log("🔍 Testing allowed_emails table...");

  try {
    // Test 1: Check if we can query the table
    console.log("Test 1: Basic table access...");
    const { data, error } = await supabase
      .from("allowed_emails")
      .select("*")
      .limit(1);

    if (error) {
      console.error("❌ Error querying allowed_emails:", error);
      return;
    }

    console.log("✅ Basic table access successful");
    console.log("📊 Sample data:", data);

    // Test 2: Check specific columns we're using
    console.log("\nTest 2: Testing specific columns...");
    const { data: columnTest, error: columnError } = await supabase
      .from("allowed_emails")
      .select("user_id, email, access_level, invited_at, invited_by, room_id")
      .limit(1);

    if (columnError) {
      console.error("❌ Error with specific columns:", columnError);
      return;
    }

    console.log("✅ Column access successful");

    // Test 3: Test filtering by room_id
    console.log("\nTest 3: Testing room_id filter...");
    const { data: filterTest, error: filterError } = await supabase
      .from("allowed_emails")
      .select("*")
      .eq("room_id", 1)
      .limit(1);

    if (filterError) {
      console.error("❌ Error filtering by room_id:", filterError);
      return;
    }

    console.log("✅ Room_id filtering successful");
    console.log(
      "🎉 All tests passed! allowed_emails table is working correctly."
    );
  } catch (error) {
    console.error("💥 Unexpected error:", error);
  }
}

// Run the test
testAllowedEmailsTable();
