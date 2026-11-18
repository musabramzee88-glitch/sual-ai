import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  // تحميل .env لكل الاختبارات (ليس فقط ما يستورد Prisma)
  test: { environment: "node", include: ["src/**/*.test.ts"], env: loadEnv(mode, process.cwd(), "") },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
}));
