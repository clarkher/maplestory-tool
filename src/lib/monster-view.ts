/**
 * 怪物卡（查資料・怪物）上的出沒地圖、掉落物怎麼列，抽出來單獨測。
 */
import { formatNumber } from "./format";
import type { Item, MapRecord, Monster } from "./types";

/** 出沒地圖一開始先列幾張，其他按「看全部」才展開 */
export const FIRST_MAPS = 5;

export type MonsterMapRow = {
  id: number;
  /** 刷怪點幾個；null 是只知道會出現、沒有刷怪點資料 */
  spawns: number | null;
  /** 這張圖還沒開放（10/15 才開），排在現在就能去的後面 */
  later: boolean;
};

/**
 * 出沒地圖：只列開放的圖——沒有中文名的是還沒開放的內容（MapRecord.zh 的規則），不列、另外算張數；
 * 現在就能去的排前面、10/15 才開的排後面，同一類刷怪點多的排前面，一樣多就照原本的順序。
 * isLater：這張圖現在還不能去（傳 notOpenYet && isV002Map）；不傳就當都能去（跟 item-view 的 shopGroups 同一個寫法，
 * 10/15 開機後拆 V002 標籤時整個拿掉就好）。
 */
export function monsterMaps(
  monster: Pick<Monster, "sp" | "maps">,
  maps: Record<string, MapRecord>,
  isLater: (map: MapRecord) => boolean = () => false,
): { rows: MonsterMapRow[]; hidden: number } {
  const spawns = new Map((monster.sp ?? []).map(([mapId, count]) => [mapId, count]));
  const ids = [...new Set([...(monster.sp ?? []).map(row => row[0]), ...monster.maps])];
  const rows: MonsterMapRow[] = [];
  let hidden = 0;
  for (const id of ids) {
    const record = maps[String(id)];
    if (!record?.zh) {
      hidden += 1;
      continue;
    }
    rows.push({ id, spawns: spawns.get(id) ?? null, later: isLater(record) });
  }
  // sort 是穩定排序：刷怪點一樣時維持原本的順序
  rows.sort((a, b) => Number(a.later) - Number(b.later) || (b.spawns ?? -1) - (a.spawns ?? -1));
  return { rows, hidden };
}

/** 掉落物：沒有名字的道具（道具清單本來就不列的）、道具資料裡沒有的，不列，另外算樣數 */
export function monsterDrops(drops: number[], itemIndex: Map<number, Pick<Item, "un">>): { shown: number[]; hidden: number } {
  const shown = drops.filter(id => {
    const item = itemIndex.get(id);
    return item !== undefined && !item.un;
  });
  return { shown, hidden: drops.length - shown.length };
}

/** 怪物清單右邊的小字：等級＋經驗（比練功效率用）；經驗 0 只寫等級，沒等級不寫 */
export function monsterNote(monster: Pick<Monster, "lv" | "exp">): string | undefined {
  if (!monster.lv) return undefined;
  return monster.exp ? `Lv.${monster.lv} · 經驗 ${formatNumber(monster.exp)}` : `Lv.${monster.lv}`;
}
