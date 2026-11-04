/**
 * 紙娃娃的「隨機穿搭」：純函式，rng 可以換成固定種子（測試用），預設 Math.random。
 * 規則：
 *   髮型、臉型各從這個性別畫得出來的挑一款，顏色從台服＋日服（t ∪ j）挑；膚色 8 選 1
 *   套服，或上衣＋褲裙，二選一（各半）
 *   鞋子、手套、帽子、披風、武器各挑一件
 *   眼飾、臉飾、耳環各 50% 機率穿一件
 *   武器是單手時 50% 配一個盾牌，雙手不配
 *   只挑畫得出來（r 有值）、性別合的；性別、動作、表情、翻面沿用 base，其他（含 base 身上的衣服）全部重挑
 * 鎖定（locks，沒傳＝都沒鎖，亂數消耗順序跟沒有這個參數時一模一樣）：
 *   鎖住的格子留 base 那一件，不挑也不吃亂數；髮型連髮色、臉型連瞳色、膚色一起留
 *   空格子的鎖不算數（liveLocks），照常挑
 *   鎖套服 -> 不挑上衣褲裙；鎖上衣或褲裙 -> 不挑套服、沒鎖的那件照挑
 *   鎖盾牌 -> 武器只挑單手；鎖雙手武器 -> 不配盾牌；鎖單手武器 -> 照舊 50% 配盾牌
 */
import { SLOT_ORDER, defaultOutfit, itemIndex, wearItem } from "./outfit";
import type { Outfit } from "./outfit";
import { liveLocks } from "./looks";
import type { LockKey } from "./looks";
import type { AvatarData, AvatarItem, AvatarStyle, Gender, SlotKey } from "./types";

type Rng = () => number;

/** 從陣列挑一個；空陣列回 undefined（rng 回到 1 時也不會越界） */
function pick<T>(list: readonly T[], rng: Rng): T | undefined {
  if (list.length === 0) return undefined;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

const fitsGender = (g: 0 | 1 | 2, who: Gender) => g === who || g === 2;

// 純記憶化：以資料物件當 key 快取每格每個性別的候選，沒有其他隱藏狀態
const pools = new WeakMap<AvatarData, Map<string, AvatarItem[]>>();

/** 這個性別這一格畫得出來的道具 */
function candidates(data: AvatarData, k: SlotKey, g: Gender): AvatarItem[] {
  let m = pools.get(data);
  if (!m) {
    m = new Map();
    pools.set(data, m);
  }
  const key = `${k}:${g}`;
  let list = m.get(key);
  if (!list) {
    list = data.items.filter((i) => i.k === k && !!i.r && fitsGender(i.g, g));
    m.set(key, list);
  }
  return list;
}

/** 挑一款這個性別畫得出來的髮型／臉型，再從台服＋日服（t ∪ j）挑一個顏色碼 */
function pickStyle(styles: AvatarStyle[], g: Gender, rng: Rng): { id: number; colour: number } | undefined {
  const style = pick(
    styles.filter((s) => fitsGender(s.g, g) && s.t.length + s.j.length > 0),
    rng,
  );
  const colour = style && pick([...style.t, ...style.j], rng);
  return style && colour !== undefined ? { id: style.id, colour } : undefined;
}

export function randomOutfit(
  data: AvatarData,
  base: Outfit,
  rng: Rng = Math.random,
  locks: ReadonlySet<LockKey> = new Set(),
): Outfit {
  const g = base.g;
  const fallback = defaultOutfit(g);
  // 空格子的鎖不算數；鎖住的格子整格跳過（不挑、不吃亂數），沒鎖的照舊順序挑
  const lock = liveLocks(locks, base);

  // 款式 id 是黑色（0 號）那個：髮型個位數是髮色、臉型百位數是瞳色；鎖住的連顏色一起留著
  let hair = base.hair;
  if (!lock.has("hair")) {
    const h = pickStyle(data.hair, g, rng);
    hair = h ? h.id + h.colour : fallback.hair;
  }
  let face = base.face;
  if (!lock.has("face")) {
    const f = pickStyle(data.face, g, rng);
    face = f ? f.id + f.colour * 100 : fallback.face;
  }
  const skin = lock.has("skin") ? base.skin : (pick(data.skin, rng)?.id ?? fallback.skin);

  // wear 從鎖住的那幾件開始，其餘空白，一件件用 wearItem 穿（它會擋套服 vs 上衣褲裙、雙手武器 vs 盾牌）
  const wear: Outfit["wear"] = {};
  for (const k of SLOT_ORDER) {
    const id = base.wear[k];
    if (lock.has(k) && id !== undefined) wear[k] = id;
  }
  let o: Outfit = { ...base, skin, hair, face, wear };
  const put = (k: SlotKey, only?: (i: AvatarItem) => boolean) => {
    const pool = candidates(data, k, g);
    const item = pick(only ? pool.filter(only) : pool, rng);
    if (item) o = wearItem(o, item, data);
  };

  if (lock.has("overall")) {
    // 鎖套服：不挑上衣、褲裙
  } else if (lock.has("coat") || lock.has("pants")) {
    // 鎖上衣或褲裙：不挑套服，沒鎖的那件照挑
    if (!lock.has("coat")) put("coat");
    if (!lock.has("pants")) put("pants");
  } else if (rng() < 0.5) {
    put("overall");
  } else {
    put("coat");
    put("pants");
  }
  for (const k of ["shoes", "glove", "cap", "cape"] as const) if (!lock.has(k)) put(k);
  // 鎖了盾牌，武器只能挑單手（雙手武器會把盾牌擠掉）
  if (!lock.has("weapon")) put("weapon", lock.has("shield") ? (i) => !i.h : undefined);
  for (const k of ["eyeAcc", "faceAcc", "earrings"] as const) if (!lock.has(k) && rng() < 0.5) put(k);

  // 沒鎖盾牌、而且武器是單手才有機會配盾牌，雙手不配
  if (!lock.has("shield")) {
    const weapon = o.wear.weapon === undefined ? undefined : itemIndex(data).get(o.wear.weapon);
    if (weapon && !weapon.h && rng() < 0.5) put("shield");
  }

  return o;
}
