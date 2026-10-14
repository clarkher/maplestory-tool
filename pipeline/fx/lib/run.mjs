/**
 * 一次收集：抓參考站 price.json → 把比 fx-data 新的市價接進 ref-samples.jsonl → 重算 latest.json、daily.json，寫到輸出資料夾。
 * 抓取函式用參數傳進來，測試不用連網。ref-samples.jsonl 只接在舊內容後面（publish 會檢查只變長）。
 * 參考站抓不到或格式不對就丟錯、不寫檔：這一輪沒有資料，workflow 變紅、notify 開 issue。
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
  const added = newRows(json, old.length ? Date.parse(old.at(-1).t) : -Infinity);
  for (const row of added) text += `${JSON.stringify(row)}\n`;

  const t = taipeiIso(now);
  const latest = { t: snapshot.t, fetchedAt: t, ask100: snapshot.ask100, listings: snapshot.listings, ladder: snapshot.ladder };
  const daily = { server: "雪吉拉", unit: "元／1 億楓幣", source: REF_PAGE, updatedAt: t, days: dailyBars(parseLines(text)) };

  const dir = path.join(outDir, DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ref-samples.jsonl"), text);
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(latest));
  fs.writeFileSync(path.join(dir, "daily.json"), JSON.stringify(daily));

  // 參考站上一次更新離現在幾小時：它每 2 小時更新，notify 在 12 小時以上時開 issue（可能停了）
  const ageHours = Math.round(((now.getTime() - Date.parse(snapshot.t)) / 3600000) * 10) / 10;
  return { t: snapshot.t, ask100: snapshot.ask100, added: added.length, ageHours };
}