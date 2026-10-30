/**
 * 地圖頁（/db/maps/[id]）用的純函式：圖上標點位置、怪物顏色、等級範圍、摘要句。
 */
import type { AtlasMap } from "./types";

/** 怪物圓點固定 6 色，依序給，超過就循環 */
export const MOB_COLORS = ["#3f8f4f", "#d4553a", "#2f9fb0", "#c9a23a", "#8a5cc7", "#d0679d"] as const;

export function mobColor(index: number): string {
  return MOB_COLORS[index % MOB_COLORS.length];
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/** 遊戲座標換成地圖畫面上的百分比位置（0～100，超出就夾在邊上） */
export function pinPercent(b: [number, number, number, number], [x, y]: [number, number]): { left: number; top: number } {
  const [left, top, width, height] = b;
  return { left: clamp(((x - left) / width) * 100), top: clamp(((y - top) / height) * 100) };
}

/** 「4～7 等」；同等級「12 等」；沒怪 undefined */
export function levelRange(mobs: AtlasMap["mobs"]): string | undefined {
  if (!mobs.length) return undefined;
  const levels = mobs.map(mob => mob.lv);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  return min === max ? `${min} 等` : `${min}～${max} 等`;
}

/** NPC 6 個以下圖上寫名字，再多只畫菱形（城鎮不會被字蓋滿） */
export function showNpcLabels(npcs: AtlasMap["npcs"]): boolean {
  return npcs.length <= 6;
}

/** 同一個目的地的門合併成一列，座標接在一起；順序照第一次出現 */
export function doorList(doors: AtlasMap["doors"]): AtlasMap["doors"] {
  const byTo = new Map<number, AtlasMap["doors"][number]>();
  for (const door of doors) {
    const seen = byTo.get(door.to);
    if (seen) seen.p = [...seen.p, ...door.p];
    else byTo.set(door.to, { ...door, p: [...door.p] });
  }
  return [...byTo.values()];
}

/** 名字太多時只寫前幾個，後面「等 N 個」 */
function listNames(names: string[], max: number, unit: string): string {
  if (names.length <= max) return names.join("、");
  return `${names.slice(0, max).join("、")}等 ${names.length} ${unit}`;
}

/** 「<圖名>（<大陸・區域>）有 <怪 n 隻…>，NPC <…>，可以通往 <…>。」沒有的那段就不寫 */
export function mapSummary(map: AtlasMap, nameOf: (id: number) => string | undefined): string {
  const place = [map.rg, map.st].filter(Boolean).join("・");
  const head = place ? `${map.n}（${place}）` : map.n;
  const parts: string[] = [];
  if (map.mobs.length) parts.push(`有${listNames(map.mobs.map(mob => `${mob.n} ${mob.k} 隻`), 6, "種怪")}`);
  if (map.npcs.length) parts.push(`NPC ${listNames(map.npcs.map(npc => npc.n), 5, "位")}`);
  const doorNames = doorList(map.doors)
    .map(door => door.n || nameOf(door.to))
    .filter((name): name is string => Boolean(name));
  if (doorNames.length) parts.push(`可以通往${listNames(doorNames, 5, "張圖")}`);
  if (!parts.length) return `${head}。`;
  // 第一段不是「有…」時要補個逗號接在圖名後面
  return parts[0].startsWith("有") ? `${head}${parts.join("，")}。` : `${head}，${parts.join("，")}。`;
}
