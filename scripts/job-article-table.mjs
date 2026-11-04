/**
 * 寫職業×等級攻略文（src/data/job-articles/）之前看的資料：計算表、假設、這個範圍的攻略列、能用的出處，印 JSON。
 *
 * 用法：npm run article:table -- <職業> <起> <迄>
 *   例：npm run article:table -- 230 31 50
 *   存檔：npm run --silent article:table -- 230 31 50 > %TEMP%\230-31-50.json
 *
 * 實際算的是 src/lib/job-article.ts 的 writerBrief；它是 TypeScript，所以借 vitest 跑 src/lib/job-article-table.gen.ts，
 * 寫到暫存檔再印出來（vitest 自己的訊息不混進 JSON）。範圍沒過門檻照樣印，看 eligible 欄位。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [job, from, to] = process.argv.slice(2);
if (![job, from, to].every(value => /^\d+$/.test(value ?? ""))) {
  console.error("用法：npm run article:table -- <職業> <起> <迄>，例 npm run article:table -- 230 31 50");
  process.exit(2);
}

const out = path.join(os.tmpdir(), `job-article-${job}-${from}-${to}-${process.pid}.json`);
const run = spawnSync("npx", ["vitest", "run", "-c", "vitest.gen.config.ts", "job-article-table"], {
  shell: process.platform === "win32",
  encoding: "utf8",
  timeout: 120_000,
  env: { ...process.env, JOB_ARTICLE: `${job}-${from}-${to}`, JOB_ARTICLE_OUT: out },
});
if (run.status !== 0 || !fs.existsSync(out)) {
  console.error(run.stdout, run.stderr, run.error ?? "");
  process.exit(1);
}
process.stdout.write(fs.readFileSync(out, "utf8") + "\n");
fs.rmSync(out, { force: true });
