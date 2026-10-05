import { isIslandMap } from "./route-planner";
import type { MapRecord, PortalEdge } from "./types";

export type RouteStep = {
  map: number;
  /** 從上一張圖走進來時用的傳送門名稱 */
  via: string;
  /** 傳送門在上一張圖的座標，用來在小地圖上標出口 */
  x?: number;
  y?: number;
};

export type RoutePlan =
  | { ok: true; steps: RouteStep[]; hops: number }
  /** 起點與終點不在同一個可步行區塊——遊戲裡要搭船或計程車 */
  | { ok: false; reason: "different-area"; fromArea: number[]; toArea: number[] }
  | { ok: false; reason: "unknown-map" };

/**
 * 傳送門最短路線。地圖數只有幾千、邊四千條，BFS 在瀏覽器裡是瞬間的事，
 * 不需要預先算好所有路線塞進檔案。
 */
export function findRoute(
  graph: Record<string, PortalEdge[]>,
  from: number,
  to: number,
): RoutePlan {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { ok: false, reason: "unknown-map" };
  if (from === to) return { ok: true, steps: [{ map: from, via: "" }], hops: 0 };

  const previous = new Map<number, { map: number; via: string; x: number; y: number }>();
  const visited = new Set<number>([from]);
  const queue: number[] = [from];

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const [next, name, x, y] of graph[String(current)] || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      previous.set(next, { map: current, via: name, x, y });
      if (next === to) return { ok: true, steps: buildSteps(previous, from, to), hops: countHops(previous, from, to) };
      queue.push(next);
    }
  }

  return {
    ok: false,
    reason: "different-area",
    fromArea: [...visited],
    toArea: reachableFrom(graph, to),
  };
}

function buildSteps(
  previous: Map<number, { map: number; via: string; x: number; y: number }>,
  from: number,
  to: number,
): RouteStep[] {
  const steps: RouteStep[] = [];
  let cursor = to;
  while (cursor !== from) {
    const link = previous.get(cursor);
    if (!link) break;
    steps.push({ map: cursor, via: link.via, x: link.x, y: link.y });
    cursor = link.map;
  }
  steps.push({ map: from, via: "" });
  return steps.reverse();
}

function countHops(
  previous: Map<number, { map: number; via: string; x: number; y: number }>,
  from: number,
  to: number,
): number {
  let hops = 0;
  let cursor = to;
  while (cursor !== from) {
    const link = previous.get(cursor);
    if (!link) break;
    hops += 1;
    cursor = link.map;
  }
  return hops;
}

export function reachableFrom(graph: Record<string, PortalEdge[]>, start: number): number[] {
  const visited = new Set<number>([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    for (const [next] of graph[String(queue[head])] || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return [...visited];
}

/**
 * 在同一個可步行區塊裡，挑一個離目標最近的城鎮當預設起點。
 * 玩家的習慣是回城再出發，所以起點應該是城鎮而不是隨便一張圖。
 */
export function suggestStart(
  graph: Record<string, PortalEdge[]>,
  maps: Record<string, MapRecord>,
  nearestTown: Record<string, [number, number]>,
  target: number,
): number | null {
  const declared = nearestTown[String(target)]?.[0];
  if (declared && maps[String(declared)]) {
    // 回城點必須真的走得到目標，否則那只是死亡傳送點而不是可步行的起點
    if (findRoute(graph, declared, target).ok) return declared;
  }

  // 反向 BFS：第一個碰到的城鎮就是最近的，不用再比距離
  const visited = new Set<number>([target]);
  const queue: number[] = [target];
  const reverse = buildReverse(graph);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current !== target && maps[String(current)]?.t) return current;
    for (const previous of reverse.get(current) || []) {
      if (visited.has(previous)) continue;
      visited.add(previous);
      queue.push(previous);
    }
  }
  return declared ?? null;
}

export type StartChoice = { kind: "start"; map: number } | { kind: "ask" } | { kind: "none" };

/**
 * /go 的預設起點。最近的城鎮（suggestStart）不是目的地就用它；
 * 目的地自己就是城鎮時（最近的城鎮＝目的地，以前會直接說「你已經在目的地了」），改用玩家上次自己選的起點——
 * 要跟目的地不同、而且走得到；都不行就先問玩家在哪個城鎮（ask），不給路線。
 * suggested 是 null（沒有城鎮走得到這張圖）就是 none。「你已經在目的地了」只在玩家自己選目的地當起點時出現。
 */
export function defaultStart(
  target: number,
  suggested: number | null,
  remembered: number | null,
  reaches: (from: number) => boolean,
): StartChoice {
  if (suggested === null) return { kind: "none" };
  if (suggested !== target) return { kind: "start", map: suggested };
  if (remembered !== null && remembered !== target && reaches(remembered)) return { kind: "start", map: remembered };
  return { kind: "ask" };
}

/** 從楓之島搭船過來的人靠岸的地方：維多利亞港 */
export const VICTORIA_PORT = 104000000;

const victoriaCache = new WeakMap<Record<string, PortalEdge[]>, Set<number>>();

/** 從維多利亞港走傳送門到得了的圖（整份傳送門資料只算一次）。黃金海灘、結婚小鎮、楓之島都不在裡面 */
export function victoriaReach(graph: Record<string, PortalEdge[]>): Set<number> {
  let reach = victoriaCache.get(graph);
  if (!reach) {
    reach = new Set(reachableFrom(graph, VICTORIA_PORT));
    victoriaCache.set(graph, reach);
  }
  return reach;
}

/**
 * 出發的城鎮那段要不要自己搭船或搭車（我們沒有船班、票價資料，只照實說，不編路線）：
 * - "island"：玩家還在楓之島、起點不在楓之島（主推卡就不寫跨區那句，島上的人另外有轉職卡）
 * - "region"：玩家不在楓之島、起點城鎮跟維多利亞島的城鎮之間沒有傳送門（例：黃金海灘）→ 這段要自己搭船或搭車過去
 * 起點本身在楓之島就都不用說：還在島上的人就在那裡，離島的人回不去（不能叫人搭船過去）。
 * /go 的起點與提示另外看 goStart（初心者不管幾等都可能還在島上）。
 */
export type BoatNote = "island" | "region";

export function boatNote(start: number, reach: Set<number>, island: boolean): BoatNote | undefined {
  if (isIslandMap(start)) return undefined;
  if (island) return "island";
  return reach.has(start) ? undefined : "region";
}

/**
 * /go 路線上面的提示：
 * - "island"：還在楓之島的話，要先搭船到維多利亞港，再照下面的路線走
 * - "port"：還在楓之島的話，搭船就會到維多利亞港（目的地就是維多利亞港）
 * - "region"：起點跟維多利亞島的城鎮之間沒有傳送門，這段要自己搭船或搭車過去；
 *   先問起點時（沒有起點）講的是目的地（黃金海灘本身）
 */
export type GoNote = "island" | "port" | "region";

/** 提示的字（from：起點的名字，跨區那句要用） */
export function goNoteText(note: GoNote, from: string): string {
  if (note === "island") return "你還在楓之島的話，要先搭船到維多利亞港，再照下面的路線走。";
  if (note === "port") return "你還在楓之島的話，搭船就會到維多利亞港。";
  return `${from}跟維多利亞島的城鎮之間沒有傳送門，這段要自己搭船或搭車過去。`;
}

/**
 * /go 走不到（兩張圖不在同一個可步行區域）時的說明。我們沒有船班資料，只照實說、不編路線：
 * - 目的地在楓之島、起點不在：只說「楓之島跟維多利亞島之間沒有傳送門。」——離開楓之島就回不去，不叫人搭車（round 4，persona 第三輪三-5）
 * - 其他：跨大陸要搭船或計程車；起點在楓之島寫「搭船」、其他寫「搭車」，再從下面的城鎮按鈕重算路線
 */
export function crossAreaText(from: number, to: number): string {
  if (isIslandMap(to) && !isIslandMap(from)) return "楓之島跟維多利亞島之間沒有傳送門。";
  return `這兩張圖不在同一個可步行區域。楓之谷跨大陸要搭船或計程車，那一段沒有傳送門資料，所以我們不會編一條路線給你。先在遊戲裡${isIslandMap(from) ? "搭船" : "搭車"}過去，再從下面挑一個當地城鎮重算路線。`;
}

/**
 * /go 的起點與路線上面的提示（round 3 B）：
 * - 玩家在這頁自己選了起點（選單或城鎮按鈕，網址的 from）：照用，不說島上的事（選了就是人在那裡）；
 *   選的起點跟維多利亞島之間沒有傳送門時照樣說跨區
 * - 初心者（不管幾等都可能還在楓之島）、目的地不在楓之島、沒自己選：記住的起點不用（那是別的角色選的）——
 *   維多利亞港走得到目的地就從維多利亞港出發（船靠岸的地方），說要先搭船到維多利亞港；
 *   目的地就是維多利亞港時只說搭船就會到（不給「你已經在目的地了」，先問在哪個城鎮）；
 *   維多利亞港走不到（黃金海灘那邊）就照最近的城鎮出發，島上跟跨區兩句都說
 * - 其他照 defaultStart（最近的城鎮；目的地是城鎮時用記住的起點，不然先問），起點跟維多利亞島沒有傳送門才說跨區
 * - 先問起點、目的地又是維多利亞島的城鎮都走不到的（黃金海灘本身，問了也沒有城鎮按鈕）：問句上面說目的地那段要自己搭船或搭車，
 *   初心者先加島上那句（round 3 最後一輪）
 */
export function goStart(args: {
  target: number;
  /** 玩家在這頁自己選的起點 */
  picked: number | null;
  /** 最近的城鎮（suggestStart） */
  suggested: number | null;
  /** 上次自己選的起點（ms-go-start） */
  remembered: number | null;
  /** 初心者（還沒轉職，不管幾等） */
  novice: boolean;
  /** 從這張圖走得到目的地 */
  reaches: (from: number) => boolean;
  /** victoriaReach */
  reach: Set<number>;
}): { choice: StartChoice; notes: GoNote[] } {
  const { target, picked, suggested, remembered, novice, reaches, reach } = args;
  const region = (start: number): GoNote[] => (boatNote(start, reach, false) === "region" ? ["region"] : []);
  // 先問起點時：目的地本身跟維多利亞島之間沒有傳送門，跨區那句講目的地
  const askNotes = (lead: GoNote[]): GoNote[] => (isIslandMap(target) || reach.has(target) ? [] : [...lead, "region"]);
  if (picked !== null) return { choice: { kind: "start", map: picked }, notes: region(picked) };
  if (novice && !isIslandMap(target)) {
    if (target === VICTORIA_PORT) return { choice: defaultStart(target, suggested, null, reaches), notes: ["port"] };
    if (reaches(VICTORIA_PORT)) return { choice: { kind: "start", map: VICTORIA_PORT }, notes: ["island"] };
    const choice = defaultStart(target, suggested, null, reaches);
    if (choice.kind === "ask") return { choice, notes: askNotes(["island"]) };
    return { choice, notes: choice.kind === "start" ? ["island", ...region(choice.map)] : [] };
  }
  const choice = defaultStart(target, suggested, remembered, reaches);
  if (choice.kind === "ask") return { choice, notes: askNotes([]) };
  return { choice, notes: choice.kind === "start" ? region(choice.map) : [] };
}

const hubCache = new WeakMap<Record<string, MapRecord>, number[]>();

/**
 * 真的城鎮（拿來做「從 X 出發」按鈕）：有中文名、客戶端標成城鎮、有別張圖回到這裡，而且回城點是自己——
 * 或是回到以它命名的郊外（客戶端把楓葉村的回城點指到楓葉村西郊平原）；名字是另一個城鎮的名字再加字的（楓葉村西郊平原）算那個城鎮的郊外。
 * 客戶端的城鎮旗標也標在民宅、城外的小山、嫩寶狩獵場Ⅰ上，沒有名字的未開放地圖也有，所以要再看回城點（地圖 id 小的在前）。
 */
export function hubTowns(maps: Record<string, MapRecord>): number[] {
  let towns = hubCache.get(maps);
  if (!towns) {
    const returnedTo = new Set<number>();
    for (const [id, record] of Object.entries(maps)) if (record.ret !== undefined && record.ret !== Number(id)) returnedTo.add(record.ret);
    const returnsHome = (id: number, record: MapRecord) =>
      record.ret === id || (record.ret !== undefined && Boolean(maps[String(record.ret)]?.zh?.startsWith(record.zh)));
    const candidates = Object.entries(maps)
      .filter(([id, record]) => record.zh && record.t && returnedTo.has(Number(id)) && returnsHome(Number(id), record));
    towns = candidates
      .filter(([, record]) => !candidates.some(([, other]) => other.zh !== record.zh && record.zh.startsWith(other.zh)))
      .map(([id]) => Number(id))
      .sort((a, b) => a - b);
    hubCache.set(maps, towns);
  }
  return towns;
}

/** 城鎮按鈕最多幾顆 */
const TOWN_CHIPS = 8;

/** 問起點時排前面的維多利亞島主要城鎮：維多利亞港、弓箭手村、魔法森林、勇士之村、墮落城市（名字照地圖資料，沒有的跳過） */
export const MAIN_TOWNS = [VICTORIA_PORT, 100000000, 101000000, 102000000, 103000000];

/**
 * 「從 X 出發」的城鎮按鈕：真的城鎮（hubTowns），走得到目的地才給；first 裡的照順序排前面（初心者的維多利亞港、
 * 問起點時維多利亞島的五個主要城鎮），其他照地圖順序。exceptTarget：目的地本身不給（問起點時，選了只會「你已經在目的地了」）。
 * 畫面上同名的只給一顆（先排的、走得到的那個）；跟目的地同名、但不是目的地那張的也不給（兩張都叫菇菇村，會排出「菇菇村 → 菇菇村 共 1 段」）。
 */
export function townChips(
  maps: Record<string, MapRecord>,
  graph: Record<string, PortalEdge[]>,
  target: number,
  options: { first?: number[]; exceptTarget?: boolean } = {},
): number[] {
  const { first = [], exceptTarget = false } = options;
  const nameOf = (id: number) => maps[String(id)]?.zh ?? "";
  const candidates = [...new Set([...first.filter(id => nameOf(id)), ...hubTowns(maps)])];
  const shown = new Set<string>();
  const chips: number[] = [];
  for (const id of candidates) {
    if (chips.length >= TOWN_CHIPS) break;
    if (exceptTarget && id === target) continue;
    if (id !== target && nameOf(id) === nameOf(target)) continue;
    if (shown.has(nameOf(id)) || !findRoute(graph, id, target).ok) continue;
    shown.add(nameOf(id));
    chips.push(id);
  }
  return chips;
}

/** 城鎮按鈕的標題：城鎮所在區域的中文名（地圖資料的區域名，城鎮裡最多的那個）；沒有就寫「目的地附近的城鎮」 */
export function townsTitle(maps: Record<string, MapRecord>, towns: number[]): string {
  const counts = new Map<string, number>();
  for (const id of towns) {
    const street = maps[String(id)]?.st;
    if (street) counts.set(street, (counts.get(street) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? `${top}的城鎮` : "目的地附近的城鎮";
}

let reverseCache: { graph: Record<string, PortalEdge[]>; map: Map<number, number[]> } | null = null;

function buildReverse(graph: Record<string, PortalEdge[]>): Map<number, number[]> {
  if (reverseCache?.graph === graph) return reverseCache.map;
  const reverse = new Map<number, number[]>();
  for (const [key, edges] of Object.entries(graph)) {
    const from = Number(key);
    for (const [to] of edges) {
      const list = reverse.get(to);
      if (list) list.push(from);
      else reverse.set(to, [from]);
    }
  }
  reverseCache = { graph, map: reverse };
  return reverse;
}
