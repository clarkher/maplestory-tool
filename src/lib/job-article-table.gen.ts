// src/lib/job-article-table.gen.ts
/**
 * 給寫手看的資料：某職業某範圍的計算表、假設、攻略列、能用的出處（src/lib/job-article.ts 的 writerBrief）。
 * 這支要讀 TypeScript 跟路徑別名，所以借 vitest 跑；平常用包好的指令：npm run article:table -- 230 31 50（scripts/job-article-table.mjs）。
 * 另一個用途：npm run article:check（scripts/job-article-check.mjs）列出被資料打壞的文章。沒給環境變數就跳過（npm run speed:glyphs 也會跑到這支）。
 */
import fs from "node:fs";
import { it } from "vitest";
import { writerBrief } from "./job-article";
import { staticCalcData, staticJobArticleCheck } from "./static-data";

const spec = process.env.JOB_ARTICLE;
const out = process.env.JOB_ARTICLE_OUT;
const checkOut = process.env.JOB_ARTICLE_CHECK_OUT;

it.runIf(spec && out)("印出某職業某範圍的計算表跟攻略內容", () => {
  const [job, from, to] = spec!.split("-").map(Number);
  fs.writeFileSync(out!, JSON.stringify(writerBrief({ job, from, to, data: staticCalcData() }), null, 2));
});

it.runIf(checkOut)("列出跟資料對不上的攻略文", () => {
  fs.writeFileSync(checkOut!, JSON.stringify(staticJobArticleCheck().broken, null, 2));
});
