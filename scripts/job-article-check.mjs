/**
 * 列出跟現在資料對不上的職業×等級攻略文（src/data/job-articles/）。這些文章建置時會被拿掉，其他頁照出。
 *
 * 用法：npm run article:check
 *   有壞的印哪一篇、哪裡不對；沒有壞的印一行。程式本身跑不起來才 exit 1，有文章壞掉不算失敗（不擋資料更新）。
 *   data-refresh.yml 也跑這支：把壞的篇名寫進 GITHUB_OUTPUT（broken_articles，空白隔開），notify 那個 job 開 issue。
 *
 * 實際比對在 src/lib/static-data.ts 的 staticJobArticleCheck；它是 TypeScript，所以跟 article:table 一樣借 vitest 跑 src/lib/job-article-table.gen.ts。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const out = path.join(os.tmpdir(), `job-article-check-${process.pid}.json`);
const run = spawnSync("npx", ["vitest", "run", "-c", "vitest.gen.config.ts", "job-article-table"], {
  shell: process.platform === "win32",
  encoding: "utf8",
  timeout: 300_000,
  env: { ...process.env, JOB_ARTICLE_CHECK_OUT: out },
});
if (run.status !== 0 || !fs.existsSync(out)) {
  console.error(run.stdout, run.stderr, run.error ?? "");
  process.exit(1);
}
const broken = JSON.parse(fs.readFileSync(out, "utf8"));
fs.rmSync(out, { force: true });

const names = broken.map(({ job, from, to }) => `${job}-${from}-${to}`);
const details = broken.flatMap(({ job, from, to, errors }) => [`${job}-${from}-${to}（這篇不出頁面）：`, ...errors.map(error => `  ${error}`)]);
console.log(broken.length ? details.join("\n") : "攻略文全部跟資料對得上。");
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `broken_articles=${names.join(" ")}\n`);
if (process.env.GITHUB_STEP_SUMMARY && broken.length) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 攻略文跟新資料對不上\n\n\`\`\`\n${details.join("\n")}\n\`\`\`\n`);
