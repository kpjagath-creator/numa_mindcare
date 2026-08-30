import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/build/**"],
    // The *.integration.test.ts files share one real local database (see backend/.env) and each
    // wipes/reseeds its own tables at the start of every test — running test files in parallel
    // would let two suites race on the same tables. Sequential file execution keeps that safe;
    // the suite is small enough that this costs no meaningful wall-clock time.
    fileParallelism: false,
  },
});
