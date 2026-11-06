import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias: { "server-only": fileURLToPath(new URL("./test/helpers/empty.ts", import.meta.url)) } },
  test: {
    environment: "node",
    setupFiles: ["./test/helpers/setup.ts"],
    projects: [
      { extends: true, test: { name: "unit", include: ["test/unit/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["./test/helpers/anvil.ts"],
          testTimeout: 180_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
