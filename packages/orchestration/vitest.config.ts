import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration files reset the same explicitly isolated test database.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
