// 查資料頁哪些卷軸／裝備可以放「算衝卷要準備多少」：規則跟 pipeline/lib/scroll-sim.mjs 的 parseSimScroll 對齊。
// 只用名字、說明、部位判斷（不抓 scroll-sim.json，/db/items 第一格保持輕）。
// 防漂移：__tests__/linkable.test.ts 會拿 public/data/items.json 跟 scroll-sim.json 逐個 id 比對，兩邊不一致就紅。
import type { Item } from "@/lib/types";

/** 卷軸名字開頭的部位 → 裝備的 s（長的先比）。要跟 pipeline/lib/scroll-sim.mjs 的 SLOT_TOKENS 同步 */
const SLOT_TOKENS: Record<string, string> = {
  頭盔: "帽子", 全身盔甲: "套服", 套服: "套服", 上衣: "上衣",
  "褲、裙": "褲裙", "褲/裙": "褲裙", 褲裙: "褲裙", 褲子: "褲裙",
  手套: "手套", 披風: "披風", 鞋子: "鞋子", 耳環: "耳環", 盾牌: "盾牌",
  戒子: "戒指", 戒指: "戒指", 腰帶: "腰帶",
  單手劍: "單手劍", 雙手劍: "雙手劍", 單手斧: "單手斧", 雙手斧: "雙手斧",
  單手棍: "單手棍", 雙手棍: "雙手棍", 槍: "槍", 矛: "矛",
  短杖: "短杖", 長杖: "長杖", 弓: "弓", 弩: "弩",
  拳套: "拳套", 短刀: "短刀", 短劍: "短刀", 指虎: "指虎", 火槍: "火槍",
};
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\/]/g, "\$&");
const SLOT_RE = new RegExp(`^(${Object.keys(SLOT_TOKENS).sort((a, b) => b.length - a.length).map(escapeRe).join("|")})`);
const NAME_PREFIX_RE = /^(?:\[[^\]]*\]\s*|楓之谷.{1,3}週年慶)/;
const RATE_CLAUSE_RE = /成功(?:率|機率)\s*[:：]?\s*(\d+)\s*%\s*[,，、]?\s*/;
const NAME_RATE_RE = /(\d+)\s*%\s*$/;
const ONLY_RE = /可使用(?:的)?裝備\s*[:：]\s*([^\n]+)/;
const BOOM_WORD_RE = /破壞|毀損|消失/;
const STAT_RE = /([^\s,，、:：;；+＋\d%。]+)\s*[+＋]\s*(\d+)/g;

/** 有卷軸對得到的裝備部位 */
const SCROLL_SLOTS = new Set(Object.values(SLOT_TOKENS));
const SKIP_EQUIP_SLOTS = new Set(["寵物裝備", "掉落道具", "裝備"]);

function boomOk(rest: string): boolean {
  if (!BOOM_WORD_RE.test(rest)) return true;
  const failAt = rest.search(/失敗/);
  const from = failAt >= 0 ? failAt : rest.search(BOOM_WORD_RE);
  if (/(\d+)\s*%/.test(rest.slice(from))) return true;
  return /失敗時道具毀損/.test(rest);
}

/** 這張卷軸算不算得了（名字、說明）；true 才放「算衝卷」按鈕 */
export function isSimScrollName(n: string, d: string | undefined): boolean {
  const name = n.trim();
  const desc = d ?? "";
  if (!name || !name.includes("卷軸") || name.startsWith("白衣")) return false;
  const rateMatch = desc.match(RATE_CLAUSE_RE);
  const nameRate = name.match(NAME_RATE_RE);
  const rate = rateMatch ? Number(rateMatch[1]) : nameRate ? Number(nameRate[1]) : NaN;
  if (!Number.isInteger(rate) || rate < 1 || rate > 100) return false;
  if (nameRate && Number(nameRate[1]) !== rate) return false;
  const rest = rateMatch ? desc.slice((rateMatch.index ?? 0) + rateMatch[0].length) : desc;
  if (!boomOk(rest)) return false;
  const cut = rest.split(/#c|若?失敗|可使用/)[0];
  if (![...cut.matchAll(STAT_RE)].length) return false;
  if (ONLY_RE.test(desc)) return true;
  return SLOT_RE.test(name.replace(NAME_PREFIX_RE, ""));
}

/** 卷軸道具能不能放入口（連 s、un 一起看） */
export function isSimScroll(item: Pick<Item, "n" | "d" | "s" | "un">): boolean {
  return item.s === "卷軸" && !item.un && isSimScrollName(item.n, item.d);
}

/** 裝備能不能放入口：可衝次數 > 0、部位有卷軸對得到 */
export function isSimEquip(item: Pick<Item, "c" | "s" | "eq">): boolean {
  const tuc = Number(item.eq?.tuc ?? 0);
  return item.c === "裝備" && tuc > 0 && !!item.s && !SKIP_EQUIP_SLOTS.has(item.s) && SCROLL_SLOTS.has(item.s);
}
