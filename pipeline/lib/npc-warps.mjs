/**
 * 靠 NPC 傳送、地圖資料裡沒有門的路（2026-10-16 v1.04）。
 *
 * 傳送門圖只看得到門：v83 跟台服客戶端（上游 maps-data.js）的冰雪峽谷Ⅱ頂端 top00 都沒寫目的地，
 * 只有尖銳的絕壁Ⅰ往下走的單向門——冰原雪域因此走不到尖銳的絕壁、狼的領土、危險的絕壁、亡者之林、
 * 廢棄礦坑Ⅰ～Ⅳ這 16 張練功圖（v1.01 code review 第 5 項）。實際上是頂端的 NPC 傑夫用腳本送過去。
 *
 * 只收有出處的：NPC 要在台服客戶端那張圖上（npcWarpEdges 會再對一次上游），送到哪、幾等放行要有腳本或公告。
 * 台服沒有證據的等級寫在 minLevel，前端會標「參考舊版資料」（2026-10-16 使用者拍板 A：照 50 等算）。
 */
export const NPC_WARPS = [
  {
    from: 211040200, // 冰雪峽谷Ⅱ
    to: 211040300, // 尖銳的絕壁Ⅰ
    npc: 2030000, // 傑夫（客戶端職稱「迷宮服務員」，台詞「只有真正的強者，才能進入」）
    spot: "最上面",
    minLevel: 50,
    source:
      "HeavenMS scripts/npc/2030000.js（Jeff - El Nath : Ice Valley II）：getLevel() > 49 才 cm.warp(211040300, 5)；"
      + "台服客戶端 maps-data.js 冰雪峽谷Ⅱ npcSpawns 有傑夫（-29, -2585），頂端 top00（-114, -2587）沒有目的地；台服的等級門檻查不到",
  },
];

/**
 * 上游那張圖上真的有這個 NPC 才給這條路（換圖、拿掉、沒名字就不給，不憑表裡的舊資料硬接）。
 * 回傳 [出發的圖, 傳送門圖的邊]：邊的名字是 `npc:<NPC 名>:<站的位置>`、座標是 NPC 站的地方、最後是幾等以上才放行。
 */
export function npcWarpEdges(upstreamMaps) {
  const byId = new Map((upstreamMaps || []).map(map => [map.id, map]));
  const edges = [];
  for (const warp of NPC_WARPS) {
    const npc = byId.get(warp.from)?.npcSpawns?.find(spawn => spawn.npcId === warp.npc);
    if (!npc?.name) continue;
    const edge = [warp.to, `npc:${npc.name}:${warp.spot}`, npc.x, npc.y];
    if (warp.minLevel !== undefined) edge.push(warp.minLevel);
    edges.push([warp.from, edge]);
  }
  return edges;
}

/**
 * 每張圖要幾等才走得到（maps.json 的 g，給沒載傳送門圖的頁面用，例如打怪練功）：
 * 從 starts（有中文名的城鎮）出發先只走不用等級的路；再照門檻由低到高逐一放行，這時才走到的圖記那個等級。
 * 不用等級就走得到的、怎樣都走不到的不記。
 */
export function gateLevels(edges, starts) {
  const levels = [...new Set(Object.values(edges).flat().map(edge => edge[4]).filter(level => level !== undefined))].sort((a, b) => a - b);
  const seen = new Set(starts);
  const result = {};
  const spread = (limit, mark) => {
    const queue = [...seen];
    for (let head = 0; head < queue.length; head += 1) {
      for (const [to, , , , minLevel] of edges[queue[head]] || []) {
        if (seen.has(to) || (minLevel !== undefined && minLevel > limit)) continue;
        seen.add(to);
        queue.push(to);
        if (mark !== undefined) result[to] = mark;
      }
    }
  };
  spread(0);
  for (const level of levels) spread(level, level);
  return result;
}
