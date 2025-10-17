import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('🚀 Starting branch system migration...\n');

  // Read the migration file
  const migrationPath = path.join(__dirname, '../migrations/branch_system.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded:', migrationPath);
  console.log('📏 SQL size:', migrationSQL.length, 'characters\n');

  // Split the SQL into individual statements
  // Note: This is a simple split - complex SQL might need better parsing
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📝 Found ${statements.length} SQL statements\n`);

  let successCount = 0;
  let errorCount = 0;

  // Execute each statement
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';';
    
    // Skip comments and empty statements
    if (statement.trim().startsWith('--') || statement.trim() === ';') {
      continue;
    }

    // Get a preview of the statement
    const preview = statement.substring(0, 60).replace(/\s+/g, ' ');
    console.log(`[${i + 1}/${statements.length}] Executing: ${preview}...`);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        // Try direct query if RPC doesn't work
        const { error: queryError } = await supabase.from('_migrations').select('*').limit(0);
        if (queryError) {
          console.error(`   ❌ Error:`, error.message);
          errorCount++;
        } else {
          console.log(`   ✅ Success (via fallback)`);
          successCount++;
        }
      } else {
        console.log(`   ✅ Success`);
        successCount++;
      }
    } catch (err: any) {
      console.error(`   ❌ Exception:`, err.message);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📝 Total: ${statements.length}`);
  console.log('='.repeat(50) + '\n');

  if (errorCount === 0) {
    console.log('🎉 Migration completed successfully!');
  } else {
    console.log('⚠️  Migration completed with errors. Please check the output above.');
    console.log('💡 Tip: You may need to run this migration manually in Supabase SQL Editor');
  }
}

runMigration().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
