/**
 * 楓幣匯率收集的排程進入點（.github/workflows/fx-collect.yml 的 collect job 跑它）。
 *
 *   node pipeline/fx/collect.mjs <fx-data 分支的 checkout（第一次可以是空資料夾）> <輸出資料夾>
 *
 * 抓參考站 price.json，把 fx/scania/ 的三個檔寫到輸出資料夾（不動 fx-data 那份）。抓不到或格式不對就 exit 1。
 * 環境變數 MANUAL_ASK100（選填）：手動補一筆，100 元換幾萬楓幣（10～2000）；有填的話參考站抓不到也不算失敗，
 * 照樣把這一筆接進去（參考站停更時用）。
 * 有 GITHUB_OUTPUT 時寫 ageHours（我們存的最後一筆離現在幾小時）與 manualAdded（這輪有沒有手動補）給 notify。
 * 本機試跑：輸出資料夾給 scratchpad，跑完看 fx/scania/latest.json。
 */
import fs from "node:fs";
import { REF_URL, USER_AGENT } from "./lib/ref.mjs";
import { githubOutputLines, parseManual } from "./lib/manual.mjs";
import { runCollect } from "./lib/run.mjs";

const [dataDir, outDir] = process.argv.slice(2);
if (!dataDir || !outDir) {
  console.error("用法：node pipeline/fx/collect.mjs <fx-data 資料夾> <輸出資料夾>");
  process.exit(2);
}

// 為什麼最多試 3 次、中間等 30 秒：一次斷線就開 issue 太吵；參考站每 2 小時才更新，等一下再試沒差
// （最壞 3 次逾時加 2 次等待約 150 秒，在 collect job 的 5 分鐘上限內）
const ATTEMPTS = 3;
const WAIT_MS = 30000;

async function fetchRefText() {
  const response = await fetch(REF_URL, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    // 5xx、429 是對方忙或限流，等一下可能就好；其他 4xx（網址錯、被擋）重試也一樣，直接失敗
    const error = new Error(`參考站 HTTP ${response.status}`);
    error.retry = response.status >= 500 || response.status === 429;
    throw error;
  }
  return response.text();
}

async function getRef() {
  let text;
  for (let attempt = 1; ; attempt += 1) {
    try {
      text = await fetchRefText();
      break;
    } catch (error) {
      // 網路錯誤、逾時沒有 retry 欄位，一律當可重試
      if (attempt >= ATTEMPTS || error.retry === false) throw error;
      console.log(`參考站第 ${attempt} 次沒抓到（${error.message}），${WAIT_MS / 1000} 秒後再試`);
      await new Promise(resolve => setTimeout(resolve, WAIT_MS));
    }
  }
  // 當文字讀、自己 JSON.parse：外站的內容只當資料（內容讀不懂是格式變了，重試也沒用，所以放在重試外面）
  return JSON.parse(text);
}

// 手動補一筆：workflow 的 manual 輸入經 MANUAL_ASK100 傳進來（沒填是空字串）；填錯在這裡就紅，不連參考站
const manualAsk100 = parseManual(process.env.MANUAL_ASK100);
const result = await runCollect({ dataDir, outDir, getRef, manualAsk100 });
console.log(JSON.stringify(result));
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, githubOutputLines(result));
