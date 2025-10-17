# Branch System Migration Runner
# Run this script to execute the branch_system.sql migration

Write-Host "Branch System Migration Runner" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if migration file exists
$migrationFile = '.\migrations\branch_system.sql'
if (!(Test-Path $migrationFile)) {
    Write-Host "❌ Error: Migration file not found at $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "Found migration file" -ForegroundColor Green
Write-Host ""

# Instructions
Write-Host "To run this migration, you have two options:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Option 1: Via Supabase Dashboard (Recommended)" -ForegroundColor Cyan
Write-Host "  1. Go to: https://supabase.com/dashboard" -ForegroundColor White
Write-Host "  2. Select your project" -ForegroundColor White
Write-Host "  3. Go to SQL Editor" -ForegroundColor White
Write-Host "  4. Create a new query" -ForegroundColor White
Write-Host "  5. Copy the contents of:" -ForegroundColor White
Write-Host "     $migrationFile" -ForegroundColor Yellow
Write-Host "  6. Paste and click 'Run'" -ForegroundColor White
Write-Host ""

Write-Host "Option 2: Copy to Clipboard" -ForegroundColor Cyan
Write-Host "  Press 'C' to copy the SQL to clipboard, then paste in Supabase SQL Editor" -ForegroundColor White
Write-Host ""

Write-Host "Option 3: View Migration Content" -ForegroundColor Cyan
Write-Host "  Press 'V' to view the migration SQL" -ForegroundColor White
Write-Host ""

Write-Host "Press Q to quit" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Your choice (C/V/Q)"

switch ($choice.ToUpper()) {
    "C" {
        try {
            Get-Content $migrationFile | Set-Clipboard
            Write-Host "Migration SQL copied to clipboard!" -ForegroundColor Green
            Write-Host "Now paste it into Supabase SQL Editor and click Run" -ForegroundColor Yellow
        } catch {
            Write-Host "Error copying to clipboard: $_" -ForegroundColor Red
        }
    }
    "V" {
        Write-Host ""
        Write-Host "=== Migration SQL Content ===" -ForegroundColor Cyan
        Write-Host ""
        Get-Content $migrationFile
        Write-Host ""
        Write-Host "=== End of Migration ===" -ForegroundColor Cyan
    }
    "Q" {
        Write-Host "Exiting..." -ForegroundColor Gray
        exit 0
    }
    default {
        Write-Host "Invalid choice. Exiting..." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "After running the migration, verify with:" -ForegroundColor Yellow
Write-Host '   SELECT * FROM branches LIMIT 5;' -ForegroundColor Gray
Write-Host ""
