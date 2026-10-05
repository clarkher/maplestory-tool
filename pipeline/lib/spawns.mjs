/**
 * 刷怪資料的來源：台服客戶端優先，沒有才用 v83。
 *
 * 2026-10-05 查到 197 張練功圖裡有 110 張，v83（國際服舊版）的出怪跟台服經典版客戶端對不上
 * （例：冰獨眼獸洞穴Ⅱ，v83 是赤龍＋青龍，台服是冰獨眼獸＋青龍＋魔龍）。上游的地圖資料（maps-data.js）
 * 帶著台服客戶端每個刷怪點的位置與回生秒數，有就用它；上游沒有刷怪資料的地圖才退回 v83。
 *
 * 只收經典版客戶端自己的刷怪點（沒有 source 欄位、有座標）。上游另外補的都不是刷怪點：
 * source: "monsterBook" 是從怪物圖鑑的出沒地點推回來的，source: "tmsv113" 是 TMS v113（台服舊版主程式）補的廢礦，兩種都沒有座標。
 */

/**
 * 一般怪沒有指定 mobTime 時的回生秒數。
 * 客戶端只在 boss 之類的刷怪點填 mobTime，一般圖留 0 代表走伺服器預設節奏。
 * 這個 7 秒是經典版社群通用估值，用途是地圖之間互相比較，不是宣稱實際每小時經驗。
 */
export const DEFAULT_RESPAWN_SECONDS = 7;

/** 一個刷怪點實際的回生秒數：沒指定（0）用預設；寫得比預設還快的（例：1 秒）也照預設算，當保險 */
export function respawnSeconds(mobTime) {
  const seconds = Number(mobTime);
  return Math.max(DEFAULT_RESPAWN_SECONDS, seconds > 0 ? seconds : DEFAULT_RESPAWN_SECONDS);
}

/**
 * 同一隻怪在同一張圖有好幾個刷怪點、回生秒數不一樣時，合成一個等效秒數：
 * 每個點每秒回生 1 ÷ 秒數 隻，加起來是整張圖每秒的隻數，再換回「點數 ÷ 每秒隻數」。
 * 不能取最大：三號線2號車庫 12 個點只有 1 個寫 1 秒，取最大會把整張圖當成每秒重生（效率灌水 7 倍）；
 * 第1軍營 20 個點只有 1 個寫 9 秒，取最大會把整張圖當成 9 秒（低估）。
 * 每個點都等於預設節奏時存 0，0 照舊代表「預設」；其他取到小數一位。
 */
export function equivalentRespawn(mobTimes) {
  if (mobTimes.every(time => respawnSeconds(time) === DEFAULT_RESPAWN_SECONDS)) return 0;
  const perSecond = mobTimes.reduce((sum, time) => sum + 1 / respawnSeconds(time), 0);
  return Math.round((mobTimes.length / perSecond) * 10) / 10;
}

/** 經典版客戶端自己的刷怪點沒有 source；上游補的（monsterBook、tmsv113）都有 */
function fromClient(spawn) {
  return spawn.source === undefined || spawn.source === null;
}

/** 上游地圖（物件或陣列）→ Map<地圖 id, [怪物 id, 刷怪點數, 等效回生秒數（0 = 預設）][]>，刷怪點多的在前 */
export function twSpawns(upstreamMaps) {
  const result = new Map();
  for (const map of Object.values(upstreamMaps || {})) {
    const id = Number(map?.id);
    if (!Number.isFinite(id)) continue;
    const byMonster = new Map();
    for (const spawn of map.monsterSpawns || []) {
      if (!fromClient(spawn)) continue;
      const mobId = Number(spawn.monsterId);
      if (!Number.isFinite(mobId)) continue;
      const times = byMonster.get(mobId) || [];
      times.push(Number(spawn.mobTime) || 0);
      byMonster.set(mobId, times);
    }
    if (byMonster.size) {
      const list = [...byMonster.entries()].map(([mobId, times]) => [mobId, times.length, equivalentRespawn(times)]);
      result.set(id, list.sort((a, b) => b[1] - a[1]));
    }
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
