/**
 * 紙娃娃（/plan/avatar）的穿搭狀態：預設、網址來回、穿脫規則、換性別。
 * 全是純函式，不碰 DOM；隨機穿搭跟 maplestory.io 網址在別的檔。
 * 網址參數（順序 g,s,h,f,w,p,e,x，只寫跟預設不一樣的）：
 *   g=1 女（男不寫）、s 膚色、h 髮型、f 臉型、w 道具 id 用「.」接、p 動作、e 表情、x=1 翻面
 *   try=<id>（查資料進來）：在該性別的預設角色身上穿上那件
 */
import type { AvatarData, AvatarItem, AvatarStyle, Gender, SlotKey } from "./types";

export type PoseKey = "stand" | "walk" | "alert" | "jump" | "prone" | "sit";
export type EmoKey = "default" | "smile" | "wink" | "angry" | "cry" | "troubled" | "bewildered" | "love";

export const POSES: { key: PoseKey; label: string }[] = [
  { key: "stand", label: "站著" },
  { key: "walk", label: "走路" },
  { key: "alert", label: "警戒" },
  { key: "jump", label: "跳" },
  { key: "prone", label: "趴下" },
  { key: "sit", label: "坐下" },
];

export const EMOS: { key: EmoKey; label: string }[] = [
  { key: "default", label: "一般" },
  { key: "smile", label: "微笑" },
  { key: "wink", label: "眨眼" },
  { key: "angry", label: "生氣" },
  { key: "cry", label: "哭" },
  { key: "troubled", label: "困擾" },
  { key: "bewildered", label: "驚訝" },
  { key: "love", label: "愛心" },
];

/** 髮色 0～7（id 個位數） */
export const HAIR_COLORS: { n: string; css: string }[] = [
  { n: "黑色", css: "#2b2b2b" },
  { n: "紅色", css: "#b8322a" },
  { n: "橘色", css: "#d9822b" },
  { n: "黃色", css: "#e3c34a" },
  { n: "綠色", css: "#4f8a3c" },
  { n: "藍色", css: "#3a6fb5" },
  { n: "紫色", css: "#7a4fa8" },
  { n: "棕色", css: "#7a5233" },
];

/** 瞳色 0～7（臉型 id 百位數） */
export const EYE_COLORS: { n: string; css: string }[] = [
  { n: "黑色", css: "#2b2b2b" },
  { n: "藍色", css: "#3a6fb5" },
  { n: "紅色", css: "#b8322a" },
  { n: "綠色", css: "#4f8a3c" },
  { n: "褐色", css: "#8a6a3a" },
  { n: "藍綠色", css: "#2f9a9a" },
  { n: "紫色", css: "#7a4fa8" },
  { n: "亮紫色", css: "#b77ad6" },
];

/** hair、face 是完整 id（含顏色）；skin 是身體 id（2000 起） */
export type Outfit = {
  g: Gender;
  skin: number;
  hair: number;
  face: number;
  wear: Partial<Record<SlotKey, number>>;
  pose: PoseKey;
  emo: EmoKey;
  flip: boolean;
};

/** 網址 w 的寫入順序（固定，網址才穩定） */
const SLOT_ORDER: SlotKey[] = ["cap", "overall", "coat", "pants", "shoes", "glove", "cape", "weapon", "shield", "eyeAcc", "faceAcc", "earrings"];

const DEFAULTS: Record<Gender, { hair: number; face: number; wear: Partial<Record<SlotKey, number>> }> = {
  0: { hair: 30030, face: 20000, wear: { coat: 1040002, pants: 1060002 } },
  1: { hair: 31470, face: 21058, wear: { coat: 1041002, pants: 1061002 } },
};

export function defaultOutfit(g: Gender): Outfit {
  const d = DEFAULTS[g];
  return { g, skin: 2000, hair: d.hair, face: d.face, wear: { ...d.wear }, pose: "stand", emo: "default", flip: false };
}

// ---------- 查表 ----------

// 純記憶化：以資料物件當 key 快取查表，沒有其他隱藏狀態（呼叫順序不影響結果）
const itemMaps = new WeakMap<AvatarData, Map<number, AvatarItem>>();
const styleMaps = new WeakMap<AvatarData, { hair: Map<number, AvatarStyle>; face: Map<number, AvatarStyle> }>();

/** 給各處用 id 找道具 */
export function itemIndex(data: AvatarData): Map<number, AvatarItem> {
  let m = itemMaps.get(data);
  if (!m) {
    m = new Map(data.items.map((i) => [i.id, i]));
    itemMaps.set(data, m);
  }
  return m;
}

function styleIndex(data: AvatarData) {
  let m = styleMaps.get(data);
  if (!m) {
    m = { hair: new Map(data.hair.map((s) => [s.id, s])), face: new Map(data.face.map((s) => [s.id, s])) };
    styleMaps.set(data, m);
  }
  return m;
}

/** 髮色碼 = 髮型 id 個位數（HAIR_COLORS 的索引） */
export const hairColour = (id: number) => id % 10;
/** 瞳色碼 = 臉型 id 百位數（EYE_COLORS 的索引） */
export const eyeColour = (id: number) => Math.floor(id / 100) % 10;

/** 髮型 id → 那一款（款式 = 個位數歸零）；這個顏色台服、日服都畫不出來就回 undefined */
export function hairStyle(data: AvatarData, id: number): AvatarStyle | undefined {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  const c = hairColour(id);
  const s = styleIndex(data).hair.get(id - c);
  return s && (s.t.includes(c) || s.j.includes(c)) ? s : undefined;
}

/** 臉型 id → 那一款（款式 = 百位數歸零）；這個瞳色台服、日服都畫不出來就回 undefined */
export function faceStyle(data: AvatarData, id: number): AvatarStyle | undefined {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  const c = eyeColour(id);
  const s = styleIndex(data).face.get(id - c * 100);
  return s && (s.t.includes(c) || s.j.includes(c)) ? s : undefined;
}

/** 這款這個顏色畫得出來 */
export function hairDrawable(data: AvatarData, id: number): boolean {
  return hairStyle(data, id) !== undefined;
}

export function faceDrawable(data: AvatarData, id: number): boolean {
  return faceStyle(data, id) !== undefined;
}

/** 道具、款式的性別適不適合 g（2＝不分） */
const fitsGender = (itemG: 0 | 1 | 2, g: Gender) => itemG === g || itemG === 2;

/** 這件能穿：資料裡有、畫得出來（有 r）、性別對 */
function wearable(item: AvatarItem | undefined, g: Gender): item is AvatarItem {
  return !!item && !!item.r && fitsGender(item.g, g);
}

// ---------- 穿脫 ----------

/** 穿上一件：同一格換掉；套服跟上衣、褲裙互斥；雙手武器跟盾牌互斥（身上那把是不是雙手，查傳進來的 data） */
export function wearItem(o: Outfit, item: AvatarItem, data: AvatarData): Outfit {
  const wear = { ...o.wear, [item.k]: item.id };
  if (item.k === "overall") {
    delete wear.coat;
    delete wear.pants;
  } else if (item.k === "coat" || item.k === "pants") {
    delete wear.overall;
  } else if (item.k === "weapon" && item.h) {
    delete wear.shield;
  } else if (item.k === "shield" && o.wear.weapon !== undefined && itemIndex(data).get(o.wear.weapon)?.h) {
    delete wear.weapon;
  }
  return { ...o, wear };
}

/**
 * 穿上 wornSlot 那一格之後，規則順手脫掉了哪幾格（before 有、after 沒有；wornSlot 自己換件不算），照網址 w 的固定順序。
 * 挑衣服卡拿來跳「上衣、褲裙跟這件不能一起穿，先脫下來了」；不管是哪條互斥規則，比前後就知道。
 */
export function removedSlots(before: Outfit["wear"], after: Outfit["wear"], wornSlot: SlotKey): SlotKey[] {
  return SLOT_ORDER.filter((k) => k !== wornSlot && before[k] !== undefined && after[k] === undefined);
}

export function takeOff(o: Outfit, k: SlotKey): Outfit {
  const wear = { ...o.wear };
  delete wear[k];
  return { ...o, wear };
}

/**
 * 換性別：穿不了的脫掉（男女都能穿的留著）；髮型、臉型不合就換新性別預設。
 * 衣服哪件被脫掉就補哪件預設：套服被脫 -> 預設上衣＋褲裙；上衣被脫 -> 預設上衣；褲裙被脫 -> 預設褲裙；
 * 其他格子（帽子、鞋子、武器…）脫了就空著。補完身上還是沒有套服、上衣、褲裙，就穿預設上衣＋褲裙。
 */
export function setGender(o: Outfit, g: Gender, data: AvatarData): Outfit {
  if (o.g === g) return o;
  const items = itemIndex(data);
  const wear: Partial<Record<SlotKey, number>> = {};
  const removed = new Set<SlotKey>();
  for (const k of SLOT_ORDER) {
    const id = o.wear[k];
    if (id === undefined) continue;
    if (wearable(items.get(id), g)) wear[k] = id;
    else removed.add(k);
  }
  const d = DEFAULTS[g].wear;
  if (!wear.overall) {
    if (removed.has("overall") || removed.has("coat")) wear.coat = d.coat;
    if (removed.has("overall") || removed.has("pants")) wear.pants = d.pants;
    if (!wear.coat && !wear.pants) {
      wear.coat = d.coat;
      wear.pants = d.pants;
    }
  }
  const hair = hairStyle(data, o.hair);
  const face = faceStyle(data, o.face);
  return {
    ...o,
    g,
    wear,
    hair: hair && fitsGender(hair.g, g) ? o.hair : DEFAULTS[g].hair,
    face: face && fitsGender(face.g, g) ? o.face : DEFAULTS[g].face,
  };
}

// ---------- 網址 ----------

const isNum = (s: string | null): s is string => s !== null && /^\d+$/.test(s);

function sameWear(a: Partial<Record<SlotKey, number>>, b: Partial<Record<SlotKey, number>>): boolean {
  return SLOT_ORDER.every((k) => a[k] === b[k]);
}

/** 不含「?」；全是預設時回 "" */
export function outfitQuery(o: Outfit): string {
  const d = defaultOutfit(o.g);
  const q: string[] = [];
  if (o.g === 1) q.push("g=1");
  if (o.skin !== d.skin) q.push(`s=${o.skin}`);
  if (o.hair !== d.hair) q.push(`h=${o.hair}`);
  if (o.face !== d.face) q.push(`f=${o.face}`);
  if (!sameWear(o.wear, d.wear)) q.push("w=" + SLOT_ORDER.flatMap((k) => (o.wear[k] === undefined ? [] : [o.wear[k]])).join("."));
  if (o.pose !== d.pose) q.push(`p=${o.pose}`);
  if (o.emo !== d.emo) q.push(`e=${o.emo}`);
  if (o.flip) q.push("x=1");
  return q.join("&");
}

/** 壞網址不壞頁：每個欄位各自驗，不合就回預設 */
export function parseOutfit(params: URLSearchParams, data: AvatarData): Outfit {
  const items = itemIndex(data);

  // try：查資料進來，在該性別的預設角色身上穿上那件（男女都能穿的看 g，沒寫就男）
  const tryRaw = params.get("try");
  if (isNum(tryRaw)) {
    const id = Number(tryRaw);
    const given: Gender = params.get("g") === "1" ? 1 : 0;
    const item = items.get(id);
    if (item && item.r) {
      return wearItem(defaultOutfit(item.g === 2 ? given : item.g), item, data);
    }
    const hair = hairStyle(data, id);
    if (hair) return { ...defaultOutfit(hair.g === 2 ? given : hair.g), hair: id };
    const face = faceStyle(data, id);
    if (face) return { ...defaultOutfit(face.g === 2 ? given : face.g), face: id };
  }

  const g: Gender = params.get("g") === "1" ? 1 : 0;
  let o = defaultOutfit(g);

  const s = params.get("s");
  if (isNum(s) && data.skin.some((k) => k.id === Number(s))) o = { ...o, skin: Number(s) };

  const h = params.get("h");
  if (isNum(h)) {
    const style = hairStyle(data, Number(h));
    if (style && fitsGender(style.g, g)) o = { ...o, hair: Number(h) };
  }

  const f = params.get("f");
  if (isNum(f)) {
    const style = faceStyle(data, Number(f));
    if (style && fitsGender(style.g, g)) o = { ...o, face: Number(f) };
  }

  // w：沒寫＝預設衣服；有寫（含空的）＝只穿認得的那幾件
  if (params.has("w")) {
    o = { ...o, wear: {} };
    for (const tok of (params.get("w") ?? "").split(".")) {
      if (!isNum(tok)) continue;
      const item = items.get(Number(tok));
      if (wearable(item, g)) o = wearItem(o, item, data);
    }
  }

  const p = params.get("p");
  const pose = POSES.find((x) => x.key === p);
  if (pose) o = { ...o, pose: pose.key };

  const e = params.get("e");
  const emo = EMOS.find((x) => x.key === e);
  if (emo) o = { ...o, emo: emo.key };

  if (params.get("x") === "1") o = { ...o, flip: true };

  return o;
}
