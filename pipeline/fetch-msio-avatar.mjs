/**
 * 紙娃娃（/plan/avatar）用：比對 maplestory.io 台服、日服的道具清單，
 * 把「我們要畫的 id 裡，哪些 maplestory.io 真的畫得出來」存成凍結檔。
 *
 * 為什麼需要這一份：maplestory.io 遇到它沒有的道具會默默不畫、照回 200（2026-11-03 實測），
 * 所以畫不畫得出來要事先比對它的道具清單，不能等畫出來才發現缺了一件。
 *
 * 台服 TWMS 256、日服 JMS 444 是固定版本，抓過就不會變，所以結果直接進版控，
 * 排程不會打 maplestory.io。上游加了新點裝時才要手動重跑：
 *
 *   node pipeline/fetch-msio-avatar.mjs
 *
 * 流程：讀 public/data/items.json → avatarCandidates 取出要比對的 id →
 * 下載兩份道具清單（各幾十 MB，很慢，逾時放寬到 240 秒）→ 寫 data/raw/msio-avatar.json。
 *
 * 輸出 { fetchedAt, twms, jms, checked }（id 陣列都由小到大）：
 *   checked  全部候選 id
 *   twms     候選裡台服清單有的
 *   jms      候選裡台服沒有、但日服有的（兩邊都有的只算台服）
 * checked 扣掉 twms 與 jms＝兩邊都畫不出來的。
 */
import path from "node:path";
import { fetchJson, writeJson, readJson, humanBytes } from "./lib/http.mjs";
import { avatarCandidates } from "./lib/avatar.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ITEMS_FILE = path.join(ROOT, "public", "data", "items.json");
const OUT_FILE = path.join(ROOT, "data", "raw", "msio-avatar.json");

const TWMS_URL = "https://maplestory.io/api/TWMS/256/item/list";
const JMS_URL = "https://maplestory.io/api/JMS/444/item/list";

/** 下載一份道具清單，回傳 id 的 Set。清單很大，所以逾時放寬 */
async function fetchIdSet(label, url) {
  console.log(`[msio-avatar] 下載 ${label} 道具清單…（幾十 MB，請等一下）`);
  const started = Date.now();
  const list = await fetchJson(url, { timeoutMs: 240000 });
  if (!Array.isArray(list)) throw new Error(`${label} 清單不是陣列（${url}）`);
  const ids = new Set(list.map(entry => Number(entry.id)).filter(Number.isFinite));
  console.log(`[msio-avatar] ${label}：${list.length} 筆，${ids.size} 個 id，花 ${((Date.now() - started) / 1000).toFixed(0)} 秒`);
  return ids;
}

async function main() {
  const items = readJson(ITEMS_FILE);
  if (!Array.isArray(items)) throw new Error(`讀不到 ${ITEMS_FILE}`);

  const checked = avatarCandidates(items);
  console.log(`[msio-avatar] 候選 ${checked.length} 個 id`);

  const twmsAll = await fetchIdSet("台服 TWMS 256", TWMS_URL);
  const jmsAll = await fetchIdSet("日服 JMS 444", JMS_URL);

  const twms = checked.filter(id => twmsAll.has(id));
  const jms = checked.filter(id => !twmsAll.has(id) && jmsAll.has(id));
  const missing = checked.length - twms.length - jms.length;

  const size = writeJson(OUT_FILE, { fetchedAt: new Date().toISOString(), twms, jms, checked });

  const pct = n => `${((n / checked.length) * 100).toFixed(1)}%`;
  console.log(`[msio-avatar] 候選 ${checked.length}`);
  console.log(`[msio-avatar] 台服有 ${twms.length}（${pct(twms.length)}）`);
  console.log(`[msio-avatar] 日服補 ${jms.length}（${pct(jms.length)}）`);
  console.log(`[msio-avatar] 兩邊都沒有 ${missing}（${pct(missing)}）`);
  console.log(`[msio-avatar] 輸出 ${path.relative(ROOT, OUT_FILE)}，${humanBytes(size)}`);
}

main().catch(error => {
  console.error("[msio-avatar] 失敗：", error);
  process.exit(1);
});
