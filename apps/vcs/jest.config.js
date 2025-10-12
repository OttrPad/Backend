module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: false,
        tsconfig: {
          types: ["jest", "node"],
        },
      },
    ],
  },
  moduleNameMapper: {
    "^@packages/(.*)$": "<rootDir>/../../packages/$1/src",
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/app.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  setupFilesAfterEnv: [],
  testTimeout: 10000,
  verbose: true,
};
