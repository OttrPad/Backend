#!/usr/bin/env node

/**
 * Comprehensive Test Runner for Real-time Broadcasting
 *
 * This script runs all the real-time broadcasting tests and provides
 * a detailed report of the functionality coverage.
 */

const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

console.log("🧪 Real-time Broadcasting Test Suite");
console.log("====================================\n");

// Test configuration
const testConfig = {
  testTimeout: 30000,
  setupTimeout: 10000,
  maxRetries: 3,
  parallel: false, // Run tests sequentially to avoid port conflicts
};

// Test categories and their descriptions
const testCategories = {
  "broadcasting.test.ts": {
    name: "📡 Socket.IO Event Broadcasting",
    description: "Tests real-time WebSocket event broadcasting functionality",
    coverage: [
      "Room management (join/leave)",
      "Notebook lifecycle events",
      "Block management events",
      "Code collaboration features",
      "User presence tracking",
      "YJS document synchronization",
      "Chat messaging",
      "Error handling",
    ],
  },
  "rest-broadcasting.test.ts": {
    name: "🌐 REST API Broadcasting",
    description: "Tests REST API endpoints with Socket.IO event broadcasting",
    coverage: [
      "REST notebook operations with broadcasting",
      "REST block operations with broadcasting",
      "Authentication and authorization",
      "Event targeting and isolation",
      "Performance and reliability",
      "Concurrent operation handling",
    ],
  },
  "yjs-management.test.ts": {
    name: "📄 YJS Document Management",
    description: "Tests YJS document management and real-time collaboration",
    coverage: [
      "Document creation and access",
      "Block and text management",
      "Notebook CRUD operations",
      "Real-time synchronization",
      "Document state management",
      "Room isolation and broadcasting",
    ],
  },
};

// Function to run a single test file
function runTestFile(testFile) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    console.log(`\n🏃 Running ${testCategories[testFile].name}...`);
    console.log(`📋 ${testCategories[testFile].description}`);

    const process = exec(`npm test -- ${testFile}`, {
      cwd: __dirname,
      timeout: testConfig.testTimeout,
      maxBuffer: 1024 * 1024 * 5, // 5MB buffer
    });

    let output = "";
    let errorOutput = "";

    process.stdout.on("data", (data) => {
      output += data;
    });

    process.stderr.on("data", (data) => {
      errorOutput += data;
    });

    process.on("close", (code) => {
      const duration = Date.now() - startTime;
      const result = {
        testFile,
        code,
        duration,
        output,
        errorOutput,
        success: code === 0,
      };

      if (result.success) {
        console.log(
          `✅ ${testCategories[testFile].name} - PASSED (${duration}ms)`
        );

        // Extract test statistics from Jest output
        const statsMatch = output.match(/Tests:\s+(\d+)\s+passed/);
        if (statsMatch) {
          console.log(`   📊 ${statsMatch[1]} tests passed`);
        }
      } else {
        console.log(
          `❌ ${testCategories[testFile].name} - FAILED (${duration}ms)`
        );
        if (errorOutput) {
          console.log(`   🔍 Error details:\n${errorOutput.slice(0, 500)}...`);
        }
      }

      resolve(result);
    });

    process.on("error", (error) => {
      console.log(
        `💥 ${testCategories[testFile].name} - ERROR: ${error.message}`
      );
      resolve({
        testFile,
        code: -1,
        duration: Date.now() - startTime,
        output: "",
        errorOutput: error.message,
        success: false,
      });
    });
  });
}

// Function to check if all dependencies are installed
function checkDependencies() {
  console.log("🔍 Checking dependencies...");

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "package.json"), "utf8")
  );
  const requiredDeps = [
    "jest",
    "ts-jest",
    "socket.io-client",
    "supertest",
    "@types/jest",
    "@types/supertest",
  ];

  const missing = requiredDeps.filter(
    (dep) => !packageJson.devDependencies[dep] && !packageJson.dependencies[dep]
  );

  if (missing.length > 0) {
    console.log(`❌ Missing dependencies: ${missing.join(", ")}`);
    console.log("💡 Run: npm install --save-dev " + missing.join(" "));
    return false;
  }

  console.log("✅ All required dependencies are available");
  return true;
}

// Function to generate test report
function generateReport(results) {
  console.log("\n📋 Test Results Summary");
  console.log("======================");

  const totalTests = results.length;
  const passedTests = results.filter((r) => r.success).length;
  const failedTests = totalTests - passedTests;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n📊 Overall Statistics:`);
  console.log(`   Total test suites: ${totalTests}`);
  console.log(`   Passed: ${passedTests} ✅`);
  console.log(`   Failed: ${failedTests} ${failedTests > 0 ? "❌" : ""}`);
  console.log(`   Total time: ${totalDuration}ms`);
  console.log(
    `   Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`
  );

  console.log(`\n🎯 Feature Coverage:`);
  Object.entries(testCategories).forEach(([testFile, config]) => {
    const result = results.find((r) => r.testFile === testFile);
    const status = result?.success ? "✅" : "❌";
    console.log(`\n${status} ${config.name}:`);
    config.coverage.forEach((feature) => {
      console.log(`   • ${feature}`);
    });
  });

  // Recommendations
  console.log(`\n💡 Recommendations:`);
  if (failedTests === 0) {
    console.log(
      "   🎉 All tests passed! Your real-time broadcasting is working correctly."
    );
    console.log(
      "   🔄 Consider running these tests regularly during development."
    );
    console.log(
      "   📈 You might want to add more edge cases and performance tests."
    );
  } else {
    console.log("   🔧 Fix failing tests before deploying to production.");
    console.log(
      "   🐛 Check server logs and network connectivity for failed tests."
    );
    console.log(
      "   ⚡ Ensure all required services are running (JWT secret, ports available)."
    );
  }

  return {
    totalTests,
    passedTests,
    failedTests,
    successRate: (passedTests / totalTests) * 100,
    totalDuration,
  };
}

// Main test runner function
async function runAllTests() {
  console.log("🚀 Starting comprehensive real-time broadcasting tests...\n");

  // Check dependencies first
  if (!checkDependencies()) {
    process.exit(1);
  }

  // Check if .env file exists and has required variables
  console.log("\n🔧 Checking environment configuration...");
  const envPath = path.join(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) {
    console.log(
      "⚠️  Warning: .env file not found. Some tests may fail without proper JWT secret."
    );
  } else {
    console.log("✅ Environment file found");
  }

  // Get list of test files
  const testFiles = Object.keys(testCategories);
  console.log(`\n📝 Found ${testFiles.length} test suites to run:`);
  testFiles.forEach((file) => {
    console.log(`   • ${file} - ${testCategories[file].name}`);
  });

  // Run tests
  const results = [];

  if (testConfig.parallel) {
    // Run tests in parallel
    console.log("\n⚡ Running tests in parallel...");
    const promises = testFiles.map(runTestFile);
    const parallelResults = await Promise.all(promises);
    results.push(...parallelResults);
  } else {
    // Run tests sequentially to avoid port conflicts
    console.log("\n🔄 Running tests sequentially...");
    for (const testFile of testFiles) {
      const result = await runTestFile(testFile);
      results.push(result);

      // Add delay between tests to ensure cleanup
      if (testFile !== testFiles[testFiles.length - 1]) {
        console.log("   ⏳ Waiting for cleanup...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  // Generate final report
  const summary = generateReport(results);

  // Exit with appropriate code
  const exitCode = summary.failedTests > 0 ? 1 : 0;
  console.log(
    `\n${exitCode === 0 ? "🎉" : "💥"} Test run completed with exit code ${exitCode}`
  );

  process.exit(exitCode);
}

// Handle interruption gracefully
process.on("SIGINT", () => {
  console.log("\n\n⏹️  Test run interrupted by user");
  console.log("🧹 Cleaning up...");
  process.exit(130);
});

process.on("SIGTERM", () => {
  console.log("\n\n⏹️  Test run terminated");
  console.log("🧹 Cleaning up...");
  process.exit(143);
});

// Run the tests
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error("💥 Unexpected error running tests:", error);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testCategories,
  testConfig,
};
