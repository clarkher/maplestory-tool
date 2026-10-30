/**
 * 地圖頁（/db/maps/[id]）、NPC 頁（/db/npcs/[id]）用的純函式：圖上標點位置、怪物顏色、等級範圍、摘要句、商店列。
 */
import { shopOpen, shopPriceText, untilText } from "./item-view";
import type { AtlasIndex, AtlasMap, AtlasNpc } from "./types";

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
  const place = mapSection(map);
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

/** 標籤放點的上面（up）或下面（down） */
export type LabelSide = "up" | "down";

/** 兩個標籤高度差小於這個（圖高的 %）、左右差小於這個（圖寬的 %）就算會疊到 */
const NEAR_TOP = 6;
const NEAR_LEFT = 14;
/** 點離上緣比這個近，標籤放上面會被切掉，一開始就放下面 */
const TOP_EDGE = 14;

/**
 * 決定每個標籤放點的上面還是下面：照順序放（先 NPC 再門），
 * 放上面會跟前面已經放好的標籤疊到就翻到下面；下面也疊到就留在上面。
 * 靠上緣的一開始就在下面，不往上翻（上面會被圖框切掉）。
 */
export function labelSides(points: { left: number; top: number }[]): LabelSide[] {
  const sides: LabelSide[] = [];
  const hits = (index: number, side: LabelSide) =>
    points.slice(0, index).some((other, j) =>
      sides[j] === side && Math.abs(other.top - points[index].top) < NEAR_TOP && Math.abs(other.left - points[index].left) < NEAR_LEFT,
    );
  points.forEach((point, index) => {
    const first: LabelSide = point.top < TOP_EDGE ? "down" : "up";
    sides.push(first === "up" && hits(index, "up") && !hits(index, "down") ? "down" : first);
  });
  return sides;
}

/** NPC 頁「賣什麼」的一列：價錢字樣跟查資料道具卡同一套；until 是活動店結束日「11/11」，e 原始結束時間 */
export type ShopLine = NonNullable<AtlasNpc["shop"]>[number] & { price: string; until?: string };

/**
 * NPC 頁「賣什麼」：過期的活動店拿掉（跟道具卡同一個 shopOpen 判斷）；常駐的在前、活動店在後，
 * 各自照價格由低到高（同幣別排一起），同價照道具編號。
 */
export function shopRows(shop: AtlasNpc["shop"], now = Date.now()): ShopLine[] {
  return (shop ?? [])
    .filter(row => shopOpen(row, now))
    .sort((a, b) => Number(Boolean(a.e)) - Number(Boolean(b.e)) || (a.u ?? "").localeCompare(b.u ?? "") || a.pr - b.pr || a.id - b.id)
    .map(row => (row.e ? { ...row, price: shopPriceText(row), until: untilText(row.e) } : { ...row, price: shopPriceText(row) }));
}

/** 「山姆在弓箭手村武器店，賣 90 樣東西。」：在哪（同名只算一次，最多 3 個名字）、賣幾樣、幾個任務，沒有的那段不寫 */
export function npcSummary(npc: AtlasNpc, nameOf: (id: number) => string | undefined): string {
  // 同名的分流圖（活動場地開好幾張）只寫一次
  const places = [...new Set(npc.maps.map(nameOf).filter((name): name is string => Boolean(name)))];
  const parts: string[] = [];
  if (npc.shop?.length) parts.push(`賣 ${npc.shop.length} 樣東西`);
  if (npc.quests?.length) parts.push(`有 ${npc.quests.length} 個任務`);
  const head = places.length ? `${npc.n}在${listNames(places, 3, "張圖")}` : npc.n;
  return parts.length ? `${head}，${parts.join("，")}。` : `${head}。`;
}

/** 地圖清單的大陸順序：跟建置時的開放地區（pipeline/build.mjs RELEASE.mapRegions）同一個順序，沒列到的排最後 */
export const REGION_ORDER = ["楓之島", "維多利亞島", "奇幻村", "鯨魚號", "楓葉世界", "冰原雪域", "廢礦"] as const;

const regionRank = (rg: string) => {
  const rank = (REGION_ORDER as readonly string[]).indexOf(rg);
  return rank < 0 ? REGION_ORDER.length : rank;
};

/** 清單、地圖頁用的「大陸・區域」：區域跟大陸同名（楓之島・楓之島）或沒有區域就只寫大陸 */
export function mapSection(map: Pick<AtlasMap, "rg" | "st">): string {
  return !map.st || map.st === map.rg ? map.rg : [map.rg, map.st].filter(Boolean).join("・");
}

/** 地圖清單搜尋用的字：圖名、大陸、區域、怪名、NPC 名，全部小寫接起來 */
export function mapSearchText(map: AtlasMap): string {
  return [map.n, map.rg, map.st, ...map.mobs.map(mob => mob.n), ...map.npcs.map(npc => npc.n)].join(" ").toLowerCase();
}

/** 搜尋字前後空白不算、大小寫不分；空的全部符合 */
export function mapMatches(text: string, query: string): boolean {
  const keyword = query.trim().toLowerCase();
  return !keyword || text.includes(keyword);
}

/** 地圖清單的一列：只帶畫面跟搜尋要的欄位（不把整張圖的座標送進瀏覽器） */
export type MapListRow = { id: number; n: string; lv?: string; q: string };
export type MapListGroup = { head: string; rows: MapListRow[] };

/**
 * 地圖清單依「大陸・區域」分組：大陸照開放順序，同大陸的區域照組裡最小的圖編號，組內照圖編號。
 */
export function mapGroups(maps: AtlasMap[]): MapListGroup[] {
  const groups = new Map<string, { rg: string; first: number; rows: MapListRow[] }>();
  for (const map of [...maps].sort((a, b) => a.id - b.id)) {
    const head = mapSection(map);
    const lv = levelRange(map.mobs);
    const row: MapListRow = lv ? { id: map.id, n: map.n, lv, q: mapSearchText(map) } : { id: map.id, n: map.n, q: mapSearchText(map) };
    const group = groups.get(head);
    if (group) group.rows.push(row);
    else groups.set(head, { rg: map.rg, first: map.id, rows: [row] });
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => regionRank(a.rg) - regionRank(b.rg) || a.first - b.first)
    .map(([head, group]) => ({ head, rows: group.rows }));
}

/** NPC 清單的一列：第一張所在圖名 at、還有幾張 more、有沒有店、任務，q 是名字＋所有所在圖名（搜尋用） */
export type NpcListRow = { id: number; n: string; img: boolean; at?: string; more: number; shop: boolean; quest: boolean; q: string };

export function npcListRows(npcs: AtlasNpc[], nameOf: (id: number) => string | undefined): NpcListRow[] {
  return npcs.map(npc => {
    // 同名的分流圖只算一張
    const places = [...new Set(npc.maps.map(nameOf).filter((name): name is string => Boolean(name)))];
    const row: NpcListRow = {
      id: npc.id,
      n: npc.n,
      img: npc.img === 1,
      more: Math.max(0, places.length - 1),
      shop: Boolean(npc.shop?.length),
      quest: Boolean(npc.quests?.length),
      q: [npc.n, ...places].join(" ").toLowerCase(),
    };
    if (places[0]) row.at = places[0];
    return row;
  });
}

/** NPC 清單的過濾：搜名字、所在地圖；「有賣東西」「有任務」開著就只留有的 */
export function npcMatches(row: NpcListRow, query: string, filters: { shop: boolean; quest: boolean }): boolean {
  if (filters.shop && !row.shop) return false;
  if (filters.quest && !row.quest) return false;
  return mapMatches(row.q, query);
}

/** index 的 id 陣列換成 Set，同一份 index 只換一次 */
const indexSets = new WeakMap<AtlasIndex, { maps: Set<number>; npcs: Set<number> }>();
function sets(index: AtlasIndex) {
  let found = indexSets.get(index);
  if (!found) {
    found = { maps: new Set(index.maps), npcs: new Set(index.npcs) };
    indexSets.set(index, found);
  }
  return found;
}

/** 別頁的地圖連結：有地圖頁就連地圖頁（頁上有帶我去），沒有或 index 還沒載到照舊連帶路 */
export function mapHref(id: number, index: AtlasIndex | null): string {
  return index && sets(index).maps.has(id) ? `/db/maps/${id}` : `/go?to=${id}`;
}

/** 別頁的 NPC 連結：有 NPC 頁才有連結，沒有就 undefined（名字照舊是純文字） */
export function npcHref(id: number, index: AtlasIndex | null): string | undefined {
  return index && sets(index).npcs.has(id) ? `/db/npcs/${id}` : undefined;
}
