// vitest.gen.config.ts
import path from "node:path";
import { defineConfig } from "vitest/config";

// 本機產東西用的，CI 不跑：npm run speed:glyphs（字形樣板，要 Windows 的微軟正黑體）、npm run avatar:showcase（首頁紙娃娃輪播的圖）
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["src/**/*.gen.ts"], testTimeout: 600_000 },
});
