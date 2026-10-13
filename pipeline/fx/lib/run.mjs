/**
 * 一次收集：讀 fx-data 上一次的狀態 → 抓 8591（失敗就靠參考站）→ 算好新的五個檔寫到輸出資料夾。
 * 抓取函式用參數傳進來，測試不用連網。兩個 .jsonl 只接在舊內容後面（publish 會檢查只變長）。
 * 參考站每次都抓：存它的歷史（8591 抓不到的空檔用它補），8591 失敗時最新一筆也用它。
 */
import fs from "node:fs";
import path from "node:path";
import { dailyBars, mergeStreams, taipeiIso } from "./daily.mjs";
import { summarize } from "./market.mjs";
import { refHistory, refSnapshot } from "./ref.mjs";
import { soldSince, stateMap } from "./volume.mjs";

export const DIR = "fx/scania";
export const FILES = ["samples.jsonl", "ref-samples.jsonl", "state.json", "latest.json", "daily.json"];
export const MIN_LISTINGS = 20;

const parseLines = text => text.split("\n").filter(line => line.trim()).map(line => JSON.parse(line));
const withNewline = text => (text && !text.endsWith("\n") ? `${text}\n` : text);

export async function runCollect({ dataDir, outDir, now = new Date(), get8591, getRef, log = console.log }) {
  const readText = name => {
    const file = path.join(dataDir, DIR, name);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  };
  const state = readText("state.json") ? JSON.parse(readText("state.json")) : { at: null, listings: {}, fail8591: 0 };
  let samplesText = withNewline(readText("samples.jsonl"));
  let refText = withNewline(readText("ref-samples.jsonl"));
  const t = taipeiIso(now);

  let own = null;
  let error8591 = null;
  try {
    const summary = summarize(await get8591());
    if (summary.kept.length < MIN_LISTINGS || summary.ask100 === null) throw new Error(`有效掛單只有 ${summary.kept.length} 筆（少於 ${MIN_LISTINGS}）`);
    own = summary;
  } catch (error) {
    error8591 = error.message;
    log(`8591 這次不算：${error8591}`);
  }

  let refJson = null;
  let errorRef = null;
  try {
    refJson = await getRef();
  } catch (error) {
    errorRef = error.message;
    log(`參考站抓不到：${errorRef}`);
  }
  const refNow = refJson ? refSnapshot(refJson) : null;
  if (refJson && !refNow) errorRef = "參考站 price.json 格式不對";

  if (!own && !refNow) throw new Error(`兩個來源都失敗：8591（${error8591}）、參考站（${errorRef}）`);

  let nextState;
  let latest;
  if (own) {
    const sold = soldSince(state.listings, own.kept);
    samplesText += `${JSON.stringify({ t, src: "8591", ask100: own.ask100, listings: own.kept.length, volNtd: sold.volNtd, volMeso: sold.volMeso })}\n`;
    nextState = { at: t, listings: stateMap(own.kept), fail8591: 0 };
    latest = { t, src: "8591", ask100: own.ask100, listings: own.kept.length, ladder: own.ladder, band: own.band };
  } else {
    // 狀態留著：下次 8591 恢復時跟最後一次看到的比，成交算在那一次
    nextState = { ...state, fail8591: (state.fail8591 ?? 0) + 1 };
    latest = { t: refNow.t, src: "ref", ask100: refNow.ask100, listings: refNow.listings, ladder: refNow.ladder, band: null };
  }

  const refRows = parseLines(refText);
  const lastRef = refRows.length ? Date.parse(refRows.at(-1).t) : -Infinity;
  for (const row of refJson ? refHistory(refJson) : []) {
    if (Date.parse(row.t) > lastRef) refText += `${JSON.stringify(row)}\n`;
  }

  const daily = { server: "雪吉拉", unit: "元／1 億楓幣", updatedAt: t, days: dailyBars(mergeStreams(parseLines(samplesText), parseLines(refText))) };

  const dir = path.join(outDir, DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "samples.jsonl"), samplesText);
  fs.writeFileSync(path.join(dir, "ref-samples.jsonl"), refText);
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(nextState));
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(latest));
  fs.writeFileSync(path.join(dir, "daily.json"), JSON.stringify(daily));

  return { ok8591: Boolean(own), okRef: Boolean(refNow), fail8591: nextState.fail8591, error8591, errorRef, src: latest.src, ask100: latest.ask100 };
}
