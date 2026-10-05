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
 * 起點城鎮跟維多利亞島的城鎮之間沒有傳送門（例：黃金海灘），這段要自己搭船或搭車——我們沒有船班、票價資料，只照實說。
 * 還在楓之島的人不算（他就在島上）；起點是楓之島的圖也不算（離島的人回不去，不能叫人搭船過去）。
 */
export function needsBoat(start: number, reach: Set<number>, island: boolean): boolean {
  return !island && !isIslandMap(start) && !reach.has(start);
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
