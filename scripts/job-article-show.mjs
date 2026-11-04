/**
 * 印出一篇職業×等級攻略文（src/data/job-articles/）換完代號的完整文字：結論、步驟、段落、表、假設、來源，
 * 最後是該貼進文章檔的 assumes 跟防呆結果。寫手、評分的人看這個，不用自己猜代號換成什麼。
 *
 * 用法：npm run article:show 110 31 50
 *   存檔：npm run --silent article:show 110 31 50 > %TEMP%\110-31-50.txt
 *
 * 實際組字在 src/lib/job-article.ts 的 articleShowText；它是 TypeScript，所以跟 article:table 一樣借 vitest 跑 src/lib/job-article-table.gen.ts。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [job, from, to] = process.argv.slice(2);
if (![job, from, to].every(value => /^\d+$/.test(value ?? ""))) {
  console.error("用法：npm run article:show <職業> <起> <迄>，例 npm run article:show 110 31 50");
  process.exit(2);
}
if (!fs.existsSync(path.join("src/data/job-articles", `${job}-${from}-${to}.json`))) {
  console.error(`沒有這篇：src/data/job-articles/${job}-${from}-${to}.json`);
  process.exit(2);
}

const out = path.join(os.tmpdir(), `job-article-show-${job}-${from}-${to}-${process.pid}.txt`);
const run = spawnSync("npx", ["vitest", "run", "-c", "vitest.gen.config.ts", "job-article-table"], {
  shell: process.platform === "win32",
  encoding: "utf8",
  timeout: 120_000,
  env: { ...process.env, JOB_ARTICLE_SHOW: `${job}-${from}-${to}`, JOB_ARTICLE_SHOW_OUT: out },
});
if (run.status !== 0 || !fs.existsSync(out)) {
  console.error(run.stdout, run.stderr, run.error ?? "");
  process.exit(1);
}
process.stdout.write(fs.readFileSync(out, "utf8") + "\n");
fs.rmSync(out, { force: true });
