/**
 * 紙娃娃（/plan/avatar）用的純函式：把 items.json 的外觀道具（髮型、臉型、12 類裝備）
 * 加上凍結的 maplestory.io 比對結果（哪些 id 畫得出來），組出 public/data/avatar.json。
 *
 * 一款髮型／臉型在 items.json 裡是「一個顏色一筆」（id 個位數是髮色、百位數是瞳色），
 * 這裡併成一款，用 t／j 記台服畫得出的顏色碼、只有日服畫得出的顏色碼；兩個都空＝畫不出來。
 * 道具則用 r 記從哪個伺服器畫（"t" 台服、"j" 日服），沒有 r＝畫不出來，排在每一類最後。
 *
 * 用法：由 pipeline/build-gear.mjs 呼叫 buildAvatar(items, msio)；
 * 要去 maplestory.io 比對的 id 用 avatarCandidates(items) 取得。測試見 avatar.test.mjs。
 */

/** 12 類道具（輸出的 k）。順序＝輸出時各類的排列順序 */
export const SLOT_KEYS = ["cap", "overall", "coat", "pants", "shoes", "glove", "cape", "weapon", "eyeAcc", "faceAcc", "earrings", "shield"];

/** id 前三碼（Math.floor(id / 10000)）→ 類別。武器另外在 weaponPrefix 判斷 */
const SLOT_BY_PREFIX = {
  100: "cap", 101: "faceAcc", 102: "eyeAcc", 103: "earrings",
  104: "coat", 105: "overall", 106: "pants", 107: "shoes",
  108: "glove", 109: "shield", 110: "cape",
};

/** 收哪些武器：130～133、137、138、140～149、170。134（刀，副武器）、160（技能效果）不收 */
function weaponPrefix(p) {
  return (p >= 130 && p <= 133) || p === 137 || p === 138 || (p >= 140 && p <= 149) || p === 170;
}

/** 皮膚：id 是身體，頭是 id + 10000（maplestory.io 要頭的 id 才能確認這色畫得出來） */
export const SKINS = [
  { id: 2000, n: "奶油皮膚" }, { id: 2001, n: "日光浴皮膚" }, { id: 2002, n: "健康皮膚" }, { id: 2003, n: "乳白皮膚" },
  { id: 2004, n: "淒涼皮膚" }, { id: 2009, n: "蒼白皮膚" }, { id: 2010, n: "貴族皮膚" }, { id: 2011, n: "華麗皮膚" },
];

const HAIR_COLOR_RE = /^(?:黑色|紅色|橘色|黃色|綠色|藍色|紫色|棕色|咖啡色|褐色)/;
const HAN_RE = /[㐀-鿿]/;
const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏가-힯]/;

/**
 * 髮型、臉型的 id 範圍：臉型 20000～29999 加 50000～59999，髮型 30000～49999 加 60000～69999
 * （maplestory.io 的 typeInfo：Face 的 lowItemId／highItemId 就是 20000～29999、50000～59999）。
 * 5 字頭曾被當成髮型，items.json 裡的 5 字頭時裝（50032、51043、54038）全是臉型。
 */
const isFaceId = id => (id >= 20000 && id < 30000) || (id >= 50000 && id < 60000);
const isHairId = id => (id >= 30000 && id < 50000) || (id >= 60000 && id < 70000);

/** 這個 id 是哪一類裝備；不是 12 類之一（戒指、墜飾、技能效果…）回 null */
export function avatarSlot(id) {
  if (id < 1000000 || id >= 2000000) return null;
  const p = Math.floor(id / 10000);
  if (weaponPrefix(p)) return "weapon";
  return SLOT_BY_PREFIX[p] ?? null;
}

/**
 * 0 男、1 女、2 不分。
 * 裝備看千位數（0 男、1 女、其他不分）；髮型臉型看同一個千位數（0356 男、1478 女、29 不分），
 * 2026-11-03 對過 maplestory.io 的 requiredGender 跟名字帶男女的 17 筆。
 */
export function avatarGender(id) {
  const d = Math.floor(id / 1000) % 10;
  if (id >= 1000000) return d === 0 ? 0 : d === 1 ? 1 : 2;
  if (d === 0 || d === 3 || d === 5 || d === 6) return 0;
  if (d === 1 || d === 4 || d === 7 || d === 8) return 1;
  return 2;
}

/** 髮型：個位數是髮色，其他是款 */
export const hairStyleOf = id => Math.floor(id / 10) * 10;
export const hairColorOf = id => id % 10;
/** 臉型：百位數是瞳色，其他是款 */
export const faceStyleOf = id => id - (Math.floor(id / 100) % 10) * 100;
export const faceColorOf = id => Math.floor(id / 100) % 10;

/** 「棕色活力冒險造型」→「活力冒險造型」（同一款的各色併成一款時要用） */
export function stripHairColor(name) {
  return name.replace(HAIR_COLOR_RE, "");
}

/** 名字要有中文、不能有韓文（韓服殘留）、不能是券（名字結尾是「券」才算，「券面設計師帽」不是） */
export function keepName(name) {
  return HAN_RE.test(name) && !HANGUL_RE.test(name) && !name.endsWith("券");
}

/**
 * 雙手武器：islot 寫 WpSi，或 id 前三碼 140～146（雙手劍、斧、棍、槍、矛、弓、弩），兩個條件任一個成立就算。
 * 槍、矛（143、144）遊戲裡是雙手、不能配盾牌，但 items.json 的 islot 寫 Wp，所以不能只看 islot。
 */
export function isTwoHanded(item) {
  if (item.eq?.islot === "WpSi") return true;
  const p = Math.floor(item.id / 10000);
  return p >= 140 && p <= 146;
}

/** 髮型、臉型的原始道具（點裝的外觀/角色） */
function styleItems(items, inRange) {
  return items.filter(i => i.c === "時裝" && i.s === "外觀/角色" && inRange(i.id) && keepName(i.n));
}

/** 能穿的道具：裝備或時裝、12 類之一、名字過關 */
function wearableItems(items) {
  return items.filter(i => (i.c === "裝備" || i.c === "時裝") && avatarSlot(i.id) !== null && keepName(i.n));
}

/** 要拿去 maplestory.io 比對的 id（排序、不重複）：每款髮型 0～7 色、每款臉型 0～7 瞳色、12 類道具、膚色的頭 */
export function avatarCandidates(items) {
  const ids = new Set();
  for (const i of styleItems(items, isHairId)) {
    const style = hairStyleOf(i.id);
    for (let c = 0; c < 8; c++) ids.add(style + c);
  }
  for (const i of styleItems(items, isFaceId)) {
    const style = faceStyleOf(i.id);
    for (let c = 0; c < 8; c++) ids.add(style + c * 100);
  }
  for (const i of wearableItems(items)) ids.add(i.id);
  for (const s of SKINS) ids.add(s.id + 10000);
  return [...ids].sort((a, b) => a - b);
}

/** 把同一款的各色併成一款；名字、小圖用這款在 items.json 裡 id 最小那筆 */
function buildStyles(items, inRange, styleOf, colorOf, colorId, nameOf, twms, jms) {
  const groups = new Map();
  for (const i of styleItems(items, inRange)) {
    const style = styleOf(i.id);
    const cur = groups.get(style);
    if (!cur || i.id < cur.id) groups.set(style, i);
  }
  const out = [];
  for (const [style, first] of groups) {
    const t = [];
    const j = [];
    for (let c = 0; c < 8; c++) {
      const id = colorId(style, c);
      if (twms.has(id)) t.push(c);
      else if (jms.has(id)) j.push(c);
    }
    out.push({ id: style, n: nameOf(first.n), g: avatarGender(style), ic: first.id, t, j });
  }
  const drawable = s => s.t.length + s.j.length > 0;
  return out.sort((a, b) => Number(drawable(b)) - Number(drawable(a)) || b.id - a.id);
}

/**
 * 組出 avatar.json。msio 是 { twms, jms, checked }：台服、日服 maplestory.io 畫得出來的 id 陣列
 * （checked 是比對過的 id，這裡不看，build-gear 用它算「沒比對過」的件數）。
 */
export function buildAvatar(items, msio) {
  const twms = new Set(msio.twms);
  const jms = new Set(msio.jms);

  const skin = SKINS.filter(s => twms.has(s.id + 10000)).map(s => ({ id: s.id, n: s.n }));
  const hair = buildStyles(items, isHairId, hairStyleOf, hairColorOf, (style, c) => style + c, stripHairColor, twms, jms);
  const face = buildStyles(items, isFaceId, faceStyleOf, faceColorOf, (style, c) => style + c * 100, n => n, twms, jms);

  const out = [];
  for (const i of wearableItems(items)) {
    const k = avatarSlot(i.id);
    const o = { id: i.id, n: i.n, k, g: avatarGender(i.id) };
    if (i.c === "時裝") o.cash = 1;
    if (twms.has(i.id)) o.r = "t";
    else if (jms.has(i.id)) o.r = "j";
    if (k === "weapon" && isTwoHanded(i)) o.h = 1;
    out.push(o);
  }
  // 每一類內：畫得出來的在前（其中點裝在前），畫不出來的在後；同組 id 大的（新的）在前
  out.sort((a, b) =>
    SLOT_KEYS.indexOf(a.k) - SLOT_KEYS.indexOf(b.k)
    || Number(!!b.r) - Number(!!a.r)
    || (a.r && b.r ? (b.cash ?? 0) - (a.cash ?? 0) : 0)
    || b.id - a.id);

  return { src: { t: "TWMS/256", j: "JMS/444" }, skin, hair, face, items: out };
}
