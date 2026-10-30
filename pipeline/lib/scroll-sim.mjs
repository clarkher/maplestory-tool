/**
 * 衝卷模擬（/plan/scroll）用的純函式：把 items.json 的卷軸說明解析成「成功率、爆裝率、成功一張加多少」，
 * 並組出 public/data/scroll-sim.json（卷軸、白衣卷軸、可衝的裝備）。
 *
 * 跟 lib/gear.mjs 的 parseScroll 是兩套：gear 那套給攻略卡（不收詛咒卷軸、部位用字是武器卡的），
 * 這套要收詛咒卷軸（算爆裝）、部位要對到 items.json 裝備的 s。兩邊互不影響，gear.json 不因這支改變。
 *
 * 用法：由 pipeline/build-gear.mjs 呼叫 buildScrollSim(items, ctx)；測試見 scroll-sim.test.mjs。
 */
import { buildSource, hasAnySource } from "./gear.mjs";

/** 卷軸名字開頭的部位／武器種類 → items.json 裝備的 s。長的先比（火槍先於槍、單手劍先於…）。 */
const SLOT_TOKENS = {
  頭盔: "帽子", 全身盔甲: "套服", 套服: "套服", 上衣: "上衣",
  "褲、裙": "褲裙", "褲/裙": "褲裙", 褲裙: "褲裙", 褲子: "褲裙",
  手套: "手套", 披風: "披風", 鞋子: "鞋子", 耳環: "耳環", 盾牌: "盾牌",
  戒子: "戒指", 戒指: "戒指", 腰帶: "腰帶",
  單手劍: "單手劍", 雙手劍: "雙手劍", 單手斧: "單手斧", 雙手斧: "雙手斧",
  單手棍: "單手棍", 雙手棍: "雙手棍", 槍: "槍", 矛: "矛",
  短杖: "短杖", 長杖: "長杖", 弓: "弓", 弩: "弩",
  拳套: "拳套", 短刀: "短刀", 短劍: "短刀", 指虎: "指虎", 火槍: "火槍",
};
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\/]/g, "\$&");
const SLOT_RE = new RegExp(`^(${Object.keys(SLOT_TOKENS).sort((a, b) => b.length - a.length).map(escapeRe).join("|")})`);

/** 名字開頭的活動標籤（[週年慶]、楓之谷四週年慶…）不影響部位 */
const NAME_PREFIX_RE = /^(?:\[[^\]]*\]\s*|楓之谷.{1,3}週年慶)/;

const STAT_NAMES = {
  STR: "力量", DEX: "敏捷", INT: "智力", LUK: "幸運", 敏捷性: "敏捷",
  MaxHP: "最大 HP", 最大HP: "最大 HP", MaxMP: "最大 MP", 最大MP: "最大 MP",
};

const RATE_CLAUSE_RE = /成功(?:率|機率)\s*[:：]?\s*(\d+)\s*%\s*[,，、]?\s*/;
const NAME_RATE_RE = /(\d+)\s*%\s*$/;
const ONLY_RE = /可使用(?:的)?裝備\s*[:：]\s*([^\n]+)/;
const BOOM_WORD_RE = /破壞|毀損|消失/;
const STAT_RE = /([^\s,，、:：;；+＋\d%。]+)\s*[+＋]\s*(\d+)/g;

function parseBoom(rest) {
  if (!BOOM_WORD_RE.test(rest)) return 0;
  const failAt = rest.search(/失敗/);
  const from = failAt >= 0 ? failAt : rest.search(BOOM_WORD_RE);
  const num = rest.slice(from).match(/(\d+)\s*%/);
  if (num) return Math.min(Number(num[1]), 100) / 100;
  // 只有「#c失敗時道具毀損。」這種沒寫數字的算失敗一定爆；其他抓不到數字的不編造
  return /失敗時道具毀損/.test(rest) ? 1 : null;
}

function parseStats(rest) {
  const cut = rest.split(/#c|若?失敗|可使用/)[0];
  const stats = [];
  for (const m of cut.matchAll(STAT_RE)) {
    const key = m[1].replace(/^使用成功/, "");
    stats.push({ k: STAT_NAMES[key] ?? key, v: Number(m[2]) });
  }
  return stats;
}

/**
 * 一個卷軸道具 → {n, slot, only?, rate, boom, effect, stats}；不是單一裝備種類的卷、抓不到成功率／爆裝率／屬性的回 null。
 * equipsByName：裝備名 → id 陣列（專用卷「可使用的裝備：…」用）。
 */
export function parseSimScroll(item, equipsByName) {
  const name = typeof item?.n === "string" ? item.n.trim() : "";
  const desc = typeof item?.d === "string" ? item.d : "";
  if (!name || !name.includes("卷軸") || name.startsWith("白衣")) return null;

  const rateMatch = desc.match(RATE_CLAUSE_RE);
  const nameRate = name.match(NAME_RATE_RE);
  const rate = rateMatch ? Number(rateMatch[1]) : nameRate ? Number(nameRate[1]) : NaN;
  if (!Number.isInteger(rate) || rate < 1 || rate > 100) return null;

  const rest = rateMatch ? desc.slice(rateMatch.index + rateMatch[0].length) : desc;
  const boom = parseBoom(rest);
  if (boom === null) return null;
  const stats = parseStats(rest);
  if (!stats.length) return null;
  const effect = stats.map(s => `${s.k}+${s.v}`).join("，");

  const onlyMatch = desc.match(ONLY_RE);
  if (onlyMatch) {
    const only = [];
    for (const raw of onlyMatch[1].split(/[、,，]/)) {
      const ids = equipsByName.get(raw.trim().replace(/[。\s]+$/, ""));
      if (ids) for (const id of ids) if (!only.includes(id)) only.push(id);
    }
    return only.length ? { n: name, slot: null, only, rate, boom, effect, stats } : null;
  }

  const slotMatch = name.replace(NAME_PREFIX_RE, "").match(SLOT_RE);
  if (!slotMatch) return null;
  return { n: name, slot: SLOT_TOKENS[slotMatch[1]], rate, boom, effect, stats };
}

const SKIP_EQUIP_SLOTS = new Set(["寵物裝備", "掉落道具", "裝備"]);

/**
 * 全部道具 → { scrolls, white, equips }。
 * 同名同成功率的卷併成一筆（ids 全放、id 取最小）；沒來源的卷也收（src:false，使用者 10/30 拍板 B）；
 * 部位對不到任何可衝裝備的卷不收；白衣卷軸另外放 white。
 */
export function buildScrollSim(items, ctx) {
  const equips = [];
  const equipsByName = new Map();
  for (const item of items) {
    if (item.c !== "裝備" || !(item.eq?.tuc > 0) || SKIP_EQUIP_SLOTS.has(item.s)) continue;
    equips.push({ id: item.id, n: item.n, s: item.s, tuc: item.eq.tuc, lv: item.eq.reqLevel ?? 0, src: hasAnySource(buildSource(item, ctx)) });
    const ids = equipsByName.get(item.n) ?? [];
    ids.push(item.id);
    equipsByName.set(item.n, ids);
  }
  equips.sort((a, b) => a.s.localeCompare(b.s) || a.lv - b.lv || a.id - b.id);
  const slots = new Set(equips.map(e => e.s));

  const white = [];
  const groups = new Map();
  for (const item of items) {
    if (item.s !== "卷軸" || item.un) continue;
    if (typeof item.n === "string" && item.n.startsWith("白衣卷軸")) {
      const rate = Number(item.d?.match(RATE_CLAUSE_RE)?.[1] ?? item.n.match(NAME_RATE_RE)?.[1]);
      if (rate > 0) white.push({ id: item.id, n: item.n, rate });
      continue;
    }
    const parsed = parseSimScroll(item, equipsByName);
    if (!parsed) continue;
    if (parsed.slot !== null && !slots.has(parsed.slot)) continue;
    const key = `${parsed.n}\u0000${parsed.rate}`;
    const group = groups.get(key) ?? { parsed, ids: [], src: false };
    group.ids.push(item.id);
    group.src ||= hasAnySource(buildSource(item, ctx));
    groups.set(key, group);
  }
  white.sort((a, b) => a.rate - b.rate || a.id - b.id);

  const scrolls = [];
  for (const { parsed, ids, src } of groups.values()) {
    ids.sort((a, b) => a - b);
    const { n, slot, only, rate, boom, effect, stats } = parsed;
    scrolls.push({ id: ids[0], ids, n, slot, ...(only ? { only } : {}), rate, boom, effect, stats, src });
  }
  scrolls.sort((a, b) => (a.slot ?? "\uffff").localeCompare(b.slot ?? "\uffff") || a.n.localeCompare(b.n) || a.rate - b.rate || a.id - b.id);
  return { scrolls, white, equips };
}
