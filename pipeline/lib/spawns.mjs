/**
 * 刷怪資料的來源：台服客戶端優先，沒有才用 v83。
 *
 * 2026-10-05 查到 197 張練功圖裡有 110 張，v83（國際服舊版）的出怪跟台服經典版客戶端對不上
 * （例：冰獨眼獸洞穴Ⅱ，v83 是赤龍＋青龍，台服是冰獨眼獸＋青龍＋魔龍）。上游的地圖資料（maps-data.js）
 * 帶著台服客戶端每個刷怪點的位置與回生秒數，有就用它；上游沒有刷怪資料的地圖才退回 v83。
 * 上游有些刷怪是從怪物圖鑑的出沒地點推回來的（source: "monsterBook"，沒有座標），那種不算刷怪點。
 */

/** 上游地圖（物件或陣列）→ Map<地圖 id, [怪物 id, 刷怪點數, mobTime 秒][]>，刷怪點多的在前 */
export function twSpawns(upstreamMaps) {
  const result = new Map();
  for (const map of Object.values(upstreamMaps || {})) {
    const id = Number(map?.id);
    if (!Number.isFinite(id)) continue;
    const byMonster = new Map();
    for (const spawn of map.monsterSpawns || []) {
      if (spawn.source === "monsterBook") continue;
      const mobId = Number(spawn.monsterId);
      if (!Number.isFinite(mobId)) continue;
      const entry = byMonster.get(mobId) || [mobId, 0, 0];
      entry[1] += 1;
      entry[2] = Math.max(entry[2], Number(spawn.mobTime) || 0);
      byMonster.set(mobId, entry);
    }
    if (byMonster.size) result.set(id, [...byMonster.values()].sort((a, b) => b[1] - a[1]));
  }
  return result;
}

/**
 * 每張地圖用哪一份刷怪資料：台服有就用台服，沒有用 v83 的 raw.m。
 * 回傳 { spawns: { [地圖 id]: [怪物 id, 數量, mobTime][] }, fromTw, fromV83 }
 */
export function mergeSpawns(tw, v83Maps) {
  const spawns = {};
  let fromTw = 0;
  let fromV83 = 0;
  const ids = new Set([...Object.keys(v83Maps || {}), ...[...tw.keys()].map(String)]);
  for (const key of ids) {
    const twList = tw.get(Number(key));
    if (twList?.length) {
      spawns[key] = twList;
      fromTw += 1;
    } else if (v83Maps?.[key]?.m?.length) {
      spawns[key] = v83Maps[key].m;
      fromV83 += 1;
    }
  }
  return { spawns, fromTw, fromV83 };
}
