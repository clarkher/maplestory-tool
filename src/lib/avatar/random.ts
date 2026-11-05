/**
 * 紙娃娃的「隨機穿搭」：純函式，rng 可以換成固定種子（測試用），預設 Math.random。
 * 規則：
 *   髮型、臉型各從這個性別畫得出來的挑一款，顏色從台服＋日服（t ∪ j）挑；膚色 8 選 1
 *   套服，或上衣＋褲裙，二選一（各半）
 *   鞋子、手套、帽子、披風、武器各挑一件
 *   眼飾、臉飾、耳環各 50% 機率穿一件
 *   武器是單手時 50% 配一個盾牌，雙手不配
 *   只挑畫得出來（r 有值）、性別合的；性別、動作、表情、翻面沿用 base，其他（含 base 身上的衣服）全部重挑
 */
import { defaultOutfit, itemIndex, wearItem } from "./outfit";
import type { Outfit } from "./outfit";
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

export function randomOutfit(data: AvatarData, base: Outfit, rng: Rng = Math.random): Outfit {
  const g = base.g;
  const fallback = defaultOutfit(g);

  // 款式 id 是黑色（0 號）那個：髮型個位數是髮色、臉型百位數是瞳色
  const h = pickStyle(data.hair, g, rng);
  const f = pickStyle(data.face, g, rng);
  const hair = h ? h.id + h.colour : fallback.hair;
  const face = f ? f.id + f.colour * 100 : fallback.face;
  const skin = pick(data.skin, rng)?.id ?? fallback.skin;

  // wear 從空白開始，一件件用 wearItem 穿（它會擋套服 vs 上衣褲裙、雙手武器 vs 盾牌）
  let o: Outfit = { ...base, skin, hair, face, wear: {} };
  const put = (k: SlotKey) => {
    const item = pick(candidates(data, k, g), rng);
    if (item) o = wearItem(o, item, data);
  };

  if (rng() < 0.5) {
    put("overall");
  } else {
    put("coat");
    put("pants");
  }
  for (const k of ["shoes", "glove", "cap", "cape", "weapon"] as const) put(k);
  for (const k of ["eyeAcc", "faceAcc", "earrings"] as const) if (rng() < 0.5) put(k);

  // 單手武器才有機會配盾牌，雙手不配
  const weapon = o.wear.weapon === undefined ? undefined : itemIndex(data).get(o.wear.weapon);
  if (weapon && !weapon.h && rng() < 0.5) put("shield");

  return o;
}
