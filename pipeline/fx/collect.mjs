/**
 * 楓幣匯率收集的排程進入點（.github/workflows/fx-collect.yml 的 collect job 跑它）。
 *
 *   node pipeline/fx/collect.mjs <fx-data 分支的 checkout（第一次可以是空資料夾）> <輸出資料夾>
 *
 * 抓參考站 price.json，把 fx/scania/ 的三個檔寫到輸出資料夾（不動 fx-data 那份）。抓不到或格式不對就 exit 1。
 * 有 GITHUB_OUTPUT 時寫 ageHours（參考站上一次更新離現在幾小時）給 notify。
 * 本機試跑：輸出資料夾給 scratchpad，跑完看 fx/scania/latest.json。
 */
import fs from "node:fs";
import { REF_URL, USER_AGENT } from "./lib/ref.mjs";
import { runCollect } from "./lib/run.mjs";

const [dataDir, outDir] = process.argv.slice(2);
if (!dataDir || !outDir) {
  console.error("用法：node pipeline/fx/collect.mjs <fx-data 資料夾> <輸出資料夾>");
  process.exit(2);
}

async function getRef() {
  const response = await fetch(REF_URL, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`參考站 HTTP ${response.status}`);
  // 當文字讀、自己 JSON.parse：外站的內容只當資料
  return JSON.parse(await response.text());
}

const result = await runCollect({ dataDir, outDir, getRef });
console.log(JSON.stringify(result));
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ageHours=${result.ageHours}\n`);