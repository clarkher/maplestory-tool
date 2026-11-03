/**
 * 紙娃娃的角色圖：把穿搭組成 maplestory.io 的角色圖網址（純函式，不碰 DOM）。
 * 網址 = ${MSIO}/<道具陣列去頭尾中括號再 encodeURIComponent>/<動作>/<第幾格>?resize=&renderMode=0&flipX=
 * 道具陣列 [{ itemId, region, version, animationName? }]：台服 TWMS／256、日服 JMS／444，同一張圖可以混。
 * 膚色放身體 skin 跟頭 skin + 10000 兩件（台服）；表情放臉型那件的 animationName（default 不放）。
 */
import { itemIndex } from "./outfit";
import type { Outfit, PoseKey } from "./outfit";
import type { AvatarData, AvatarItem, Region, SlotKey } from "./types";

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

type Part = { itemId: number; region: string; version: string; animationName?: string };
const part = (itemId: number, r: Region, animationName?: string): Part => ({
  itemId,
  ...SERVER[r],
  ...(animationName ? { animationName } : {}),
});

/** 道具在陣列裡的順序（固定，同一套穿搭網址才一樣） */
const WEAR_ORDER: SlotKey[] = ["cap", "overall", "coat", "pants", "shoes", "glove", "cape", "weapon", "shield", "eyeAcc", "faceAcc", "earrings"];

/**
 * 站著、走路的 stance：槍、矛（武器 id 前三碼 143、144）要用 stand2／walk2 才畫得出武器，
 * 其他（含沒拿武器、點裝武器）用 stand1／walk1（雙手劍、弓、火槍、點裝武器在 stand1 才畫得出）；
 * 警戒、跳、趴下、坐下照動作名字。
 */
export function stanceFor(pose: PoseKey, weapon: AvatarItem | undefined): string {
  if (pose !== "stand" && pose !== "walk") return pose;
  const type = weapon ? Math.floor(weapon.id / 10000) : 0;
  return pose + (type === 143 || type === 144 ? "2" : "1");
}

/** 髮型：個位數是髮色；臉型：百位數是瞳色。這個顏色台服有畫就走台服，沒有就走日服 */
function styleRegion(data: AvatarData, kind: "hair" | "face", id: number): Region {
  const colour = kind === "hair" ? id % 10 : Math.floor(id / 100) % 10;
  const styleId = kind === "hair" ? id - colour : id - colour * 100;
  const style = data[kind].find((s) => s.id === styleId);
  return style && !style.t.includes(colour) && style.j.includes(colour) ? "j" : "t";
}

export function characterUrl(o: Outfit, data: AvatarData, opts: { frame: number; resize: number }): string {
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
  const list = encodeURIComponent(JSON.stringify(parts).slice(1, -1));
  return `${MSIO}/${list}/${stanceFor(o.pose, weapon)}/${opts.frame}?resize=${opts.resize}&renderMode=0&flipX=${o.flip}`;
}
