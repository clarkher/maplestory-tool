/**
 * 系列任務、地區懶人包、職業配點攻略文（v2.27）的表格：從 public/data 產，寫進 md 的 <!-- gen:<key> --> 到 <!-- /gen --> 之間。
 *
 * 用法：
 *   npm run guide:gen                              全部重產（資料更新後跑；guide-gen.test.ts 不一致會紅）
 *   npm run guide:gen -- new quest-line 3053       新的系列任務文（任務 id：系列裡任一個都行）
 *   npm run guide:gen -- new quests victoria       新的地區懶人包（maple-island／victoria／el-nath）
 *   npm run guide:gen -- new skill-build 130       新的職業配點文（二轉職業代碼）
 *   新文章建好後：寫 <!-- 寫 --> 那幾段、RELATED_RULES 登記、scripts/guide-card-heroes.mjs 加主圖。
 *
 * 實際算的是 src/lib/guide-gen/ 的 TypeScript，借 vitest 跑 src/lib/guide-gen.gen.ts（跟 article:table 同一招）。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [cmd, kind, key] = process.argv.slice(2);
if (cmd && !(cmd === "new" && ["quest-line", "quests", "skill-build"].includes(kind) && key)) {
  console.error("用法：npm run guide:gen [-- new <quest-line|quests|skill-build> <任務 id｜地區｜二轉職業代碼>]");
  process.exit(2);
}

const out = path.join(os.tmpdir(), `guide-gen-${process.pid}.txt`);
const run = spawnSync("npx", ["vitest", "run", "-c", "vitest.gen.config.ts", "guide-gen.gen"], {
  shell: process.platform === "win32",
  encoding: "utf8",
  timeout: 300_000,
  env: { ...process.env, GUIDE_GEN: cmd ? `new:${kind}:${key}` : "all", GUIDE_GEN_OUT: out },
});
if (run.status !== 0 || !fs.existsSync(out)) {
  console.error(run.stdout, run.stderr, run.error ?? "");
  process.exit(1);
}
console.log(fs.readFileSync(out, "utf8"));
fs.rmSync(out, { force: true });
