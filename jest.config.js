export default {
  testEnvironment: "node",
  testTimeout: 15000,
  setupFiles: ["<rootDir>/src/test-utils/setup.ts"],
  testMatch: ["<rootDir>/src/features/**/*.test.ts"],
  // Treat TypeScript files as ESM so features like `import.meta` work,
  // which Prisma's generated client relies on.
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.(t|j)sx?$": "babel-jest",
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  transformIgnorePatterns: [
    // Default pattern ignores node_modules; override to allow Prisma's generated client
    '/node_modules/(?!(prisma|prisma/generated))',
  ],
  // TypeScript source files use .js extensions in imports (Node ESM requirement).
  // Jest resolves at the filesystem level, so remap .js → .ts so it finds the source.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
