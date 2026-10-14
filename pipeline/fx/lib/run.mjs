/**
 * 一次收集：抓參考站 price.json → 把比 fx-data 新的市價接進 ref-samples.jsonl → 重算 latest.json、daily.json，寫到輸出資料夾。
 * 抓取函式用參數傳進來，測試不用連網。ref-samples.jsonl 只接在舊內容後面（publish 會檢查只變長）。
 * 參考站抓不到或格式不對就丟錯、不寫檔：這一輪沒有資料，workflow 變紅、notify 開 issue。
 * ageHours 量的是「我們存下來的最後一筆市價離現在幾小時」，不是參考站自己的時鐘：
 * 參考站可能照常更新、但歷史改了口徑（m 變了）或欄位改名，那樣一筆都接不上、workflow 全綠，
 * 只有量我們自己的最後一筆才看得到停滯（參考站只留約 5 天，漏太久的資料就永遠補不回來）。
 */
import fs from "node:fs";
import path from "node:path";
import { dailyBars, taipeiIso } from "./daily.mjs";
import { REF_PAGE, newRows, refSnapshot } from "./ref.mjs";

export const DIR = "fx/scania";
export const FILES = ["ref-samples.jsonl", "latest.json", "daily.json"];

const parseLines = text => text.split("\n").filter(line => line.trim()).map(line => JSON.parse(line));
const withNewline = text => (text && !text.endsWith("\n") ? `${text}\n` : text);

export async function runCollect({ dataDir, outDir, now = new Date(), getRef }) {
  const json = await getRef();
  const snapshot = refSnapshot(json);
  if (!snapshot) throw new Error("參考站 price.json 格式不對（找不到雪吉拉的市價）");

  const file = path.join(dataDir, DIR, "ref-samples.jsonl");
  let text = withNewline(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  const old = parseLines(text);
  // 最後一筆的時間讀不懂就不能拿來比新舊（跟 NaN 比會永遠是「沒有更新的」），直接擋下來
  const lastT = old.length ? Date.parse(old.at(-1).t) : -Infinity;
  if (Number.isNaN(lastT)) throw new Error("ref-samples.jsonl 最後一筆的時間讀不懂，接不上新資料");
  const added = newRows(json, lastT);
  for (const row of added) text += `${JSON.stringify(row)}\n`;

  const rows = parseLines(text);
  if (!rows.length) throw new Error("參考站沒有任何可用的市價（歷史口徑或欄位可能改了）");
  // 我們存下來的最後一筆離現在幾小時：參考站每 2 小時更新，notify 在 12 小時以上時開 issue
  // 不用 snapshot.t：參考站時鐘照走、但歷史一筆都接不上時，用它會一直顯示「剛更新」而漏掉停滯
  const ageHours = Math.round(((now.getTime() - Date.parse(rows.at(-1).t)) / 3600000) * 10) / 10;

  const t = taipeiIso(now);
  const latest = { t: snapshot.t, fetchedAt: t, ask100: snapshot.ask100, listings: snapshot.listings, ladder: snapshot.ladder };
  const daily = { server: "雪吉拉", unit: "元／1 億楓幣", source: REF_PAGE, updatedAt: t, days: dailyBars(rows) };

  const dir = path.join(outDir, DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ref-samples.jsonl"), text);
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(latest));
  fs.writeFileSync(path.join(dir, "daily.json"), JSON.stringify(daily));
  return { t: snapshot.t, ask100: snapshot.ask100, added: added.length, ageHours };
}
