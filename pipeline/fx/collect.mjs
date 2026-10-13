/**
 * 楓幣匯率收集的排程進入點（.github/workflows/fx-collect.yml 的 collect job 跑它）。
 *
 *   node pipeline/fx/collect.mjs <fx-data 分支的 checkout（第一次可以是空資料夾）> <輸出資料夾>
 *
 * 抓 8591 雪吉拉楓幣掛單＋參考站 price.json，把 fx/scania/ 的五個檔寫到輸出資料夾（不動 fx-data 那份）。
 * 兩個來源都失敗就 exit 1。有 GITHUB_OUTPUT 時寫 ok8591、okRef、fail8591 給 notify。
 * 本機試跑（會真的連 8591 一次，約 12 頁、40 秒）：輸出資料夾給 scratchpad，跑完看 fx/scania/latest.json。
 */
import fs from "node:fs";
import { USER_AGENT, fetchAllListings } from "./lib/fetch8591.mjs";
import { REF_URL } from "./lib/ref.mjs";
import { runCollect } from "./lib/run.mjs";

const [dataDir, outDir] = process.argv.slice(2);
if (!dataDir || !outDir) {
  console.error("用法：node pipeline/fx/collect.mjs <fx-data 資料夾> <輸出資料夾>");
  process.exit(2);
}

async function getRef() {
  const response = await fetch(REF_URL, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // 當文字讀、自己 JSON.parse：外站的內容只當資料
  return JSON.parse(await response.text());
}

const result = await runCollect({ dataDir, outDir, get8591: () => fetchAllListings(), getRef });
console.log(JSON.stringify(result));
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `ok8591=${result.ok8591}\nokRef=${result.okRef}\nfail8591=${result.fail8591}\n`);
}
