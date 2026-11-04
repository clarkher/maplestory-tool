/**
 * 紙娃娃的角色圖：把穿搭組成 maplestory.io 的角色圖網址（純函式，不碰 DOM）。
 * 網址 = ${MSIO}/<道具陣列去頭尾中括號再 encodeURIComponent>/<動作>/<第幾格>?resize=&renderMode=&flipX=
 * 道具陣列 [{ itemId, region, version, animationName? }]：台服 TWMS／256、日服 JMS／444，同一張圖可以混。
 * 膚色放身體 skin 跟頭 skin + 10000 兩件（台服）；表情放臉型那件的 animationName（default 不放）。
 * renderMode（11/03 實測）：
 *   0 裁到剛好包住角色（照 resize 放大）：每格裁法不同，舞台逐格置中會左右滑，只拿來下載
 *   2 腳在左右正中間，上下照樣裁到剛好（忽略 resize，一律 1 倍）：腳底下有東西垂著（槍的穗子）時貼底對齊還是會上下跳
 *   4 腳在整張圖正中間（左右、上下都是；忽略 resize，一律 1 倍）：舞台把圖的中心對到地面線，每格的腳就固定不動
 *   （1 是固定 96×96、大道具會被切掉，不用）
 */
import { eyeColour, faceStyle, hairColour, hairStyle, itemIndex } from "./outfit";
import type { Outfit, PoseKey } from "./outfit";
import type { AvatarData, Region, SlotKey } from "./types";

export const MSIO = "https://maplestory.io/api/character";

/** 每個動作有幾格、每格停幾毫秒（跳、趴、坐只有一格，ms 不會用到） */
export const FRAMES: Record<PoseKey, { n: number; ms: number }> = {
  stand: { n: 3, ms: 500 },
  walk: { n: 4, ms: 180 },
  alert: { n: 3, ms: 500 },
  jump: { n: 1, ms: 1000 },
  prone: { n: 1, ms: 1000 },
  sit: { n: 1, ms: 1000 },
};

const SERVER: Record<Region, { region: string; version: string }> = {
  t: { region: "TWMS", version: "256" },
  j: { region: "JMS", version: "444" },
};

export type Part = { itemId: number; region: string; version: string; animationName?: string };
/** 一件道具在網址道具陣列裡的樣子；r 是台服還是日服 */
export const part = (itemId: number, r: Region, animationName?: string): Part => ({
  itemId,
  ...SERVER[r],
  ...(animationName ? { animationName } : {}),
});

/** 道具在陣列裡的順序（固定，同一套穿搭網址才一樣） */
export const WEAR_ORDER: SlotKey[] = ["cap", "overall", "coat", "pants", "shoes", "glove", "cape", "weapon", "shield", "eyeAcc", "faceAcc", "earrings"];

/**
 * 站著、走路的 stance：槍、矛（武器 id 前三碼 143、144）要用 stand2／walk2 才畫得出武器，
 * 其他（含沒拿武器、點裝武器）用 stand1／walk1（雙手劍、弓、火槍、點裝武器在 stand1 才畫得出）；
 * 警戒、跳、趴下、坐下照動作名字。
 */
export function stanceFor(pose: PoseKey, weapon: { id: number } | undefined): string {
  if (pose !== "stand" && pose !== "walk") return pose;
  const type = weapon ? Math.floor(weapon.id / 10000) : 0;
  return pose + (type === 143 || type === 144 ? "2" : "1");
}

/** 髮型：個位數是髮色；臉型：百位數是瞳色。這個顏色台服有畫就走台服，沒有就走日服 */
export function styleRegion(data: AvatarData, kind: "hair" | "face", id: number): Region {
  const colour = kind === "hair" ? hairColour(id) : eyeColour(id);
  const style = kind === "hair" ? hairStyle(data, id) : faceStyle(data, id);
  return style && !style.t.includes(colour) && style.j.includes(colour) ? "j" : "t";
}

export type RenderMode = 0 | 2 | 4;

/** 舞台要的那一格（1 倍、renderMode=4）。舞台跟預載都走這支：舞台靠網址查預載，兩邊要一字不差 */
export function stageUrl(o: Outfit, data: AvatarData, frame: number): string {
  return characterUrl(o, data, { frame, resize: 1, mode: 4 });
}

/** 道具陣列＋動作＋第幾格 → maplestory.io 角色圖網址。分享連結的 route 沒有資料檔，直接餵自己組好的陣列，所以獨立出來 */
export function msioUrl(parts: Part[], stance: string, frame: number, opts: { resize: number; mode: RenderMode; flip: boolean }): string {
  const list = encodeURIComponent(JSON.stringify(parts).slice(1, -1));
  return `${MSIO}/${list}/${stance}/${frame}?resize=${opts.resize}&renderMode=${opts.mode}&flipX=${opts.flip}`;
}

/** mode 沒寫＝0（裁剛好、照 resize 放大） */
export function characterUrl(o: Outfit, data: AvatarData, opts: { frame: number; resize: number; mode?: RenderMode }): string {
  const items = itemIndex(data);
  const parts: Part[] = [
    part(o.skin, "t"),
    part(o.skin + 10000, "t"),
    part(o.hair, styleRegion(data, "hair", o.hair)),
    part(o.face, styleRegion(data, "face", o.face), o.emo === "default" ? undefined : o.emo),
  ];
  for (const k of WEAR_ORDER) {
    const id = o.wear[k];
    const item = id === undefined ? undefined : items.get(id);
    // 資料裡沒有、畫不出來（沒有 r）的不放，免得 maplestory.io 整張圖 404
    if (item?.r) parts.push(part(item.id, item.r));
  }
  const weapon = o.wear.weapon === undefined ? undefined : items.get(o.wear.weapon);
  return msioUrl(parts, stanceFor(o.pose, weapon), opts.frame, { resize: opts.resize, mode: opts.mode ?? 0, flip: o.flip });
}
