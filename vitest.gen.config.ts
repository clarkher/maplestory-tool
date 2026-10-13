// vitest.gen.config.ts
import path from "node:path";
import { defineConfig } from "vitest/config";

// 本機產練功測速的字形樣板（要 Windows 的微軟正黑體），CI 不跑：npm run speed:glyphs
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["src/**/*.gen.ts"], testTimeout: 600_000 },
});
