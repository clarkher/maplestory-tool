/**
 * 地圖、NPC 圖鑑的資料（v1.24，/db/maps、/db/npcs）。
 *
 * 來源是上游 maps-data.js（artale.json 的 maps，台服客戶端抽的）：每張圖的刷怪點、NPC、傳送門、畫面範圍。
 * 產出三個檔（build.mjs 寫）：
 *  - atlas-maps.json：收進來的每張圖的怪、NPC、門
 *  - npcs.json：每個 NPC 在哪幾張圖、賣什麼、跟哪些任務有關
 *  - atlas-index.json：收進來的圖 id、NPC id（排好序，給靜態頁、sitemap 用）
 *
 * 收哪些圖（設計見 docs/superpowers/specs/2026-10-30-map-npc-atlas-design.md「資料」）：符合任一條就收
 *  1. maps.json 有 zh（站上本來就當成已開放的圖）；
 *  2. 上游有名字、不是 unnamed、不在 HELD_BACK_MAPS，而且 regionName 在 RELEASE.mapRegions 裡。
 *     這條嚴格比對，regionName 空白的不收（跟 collectChineseMapNames 不同：那邊空白照舊放行）。
 * 第 2 條是為了把各村的店面、室內收進來（弓箭手村武器店 100000101），只用在 atlas，
 * 不准回寫 maps.json 的 zh——zh 會影響帶我去、主推卡、出沒地圖。
 *
 *  第 2 條多收的圖另外排除：街名是「隱藏地圖」「航海中」的、算完門之後一個門都沒有的（只靠 NPC、任務進去的房間）。
 * 一張圖收進來了，但怪、NPC、門都沒有，就不收（頁面上沒東西可看）。
 */

/**
 * 每張圖所有的門（[目的圖, 門名, x, y]），同一個目的地有幾個門就留幾條。
 * 跟 build.mjs 的 buildGraph 同一套規則（v83 的 p、目的圖要在 maps.json、pt 2／3 補反向門），
 * 只是不併成一條：buildGraph 給帶我去用，每個目的地一條就夠；地圖頁要把每個門都標出來。
 * @param {Record<string, { p?: Array<[number, string, string, number, number, number]> }>} v83Maps
 * @param {Record<string, object>} mapRecords
 */
export function doorEdges(v83Maps, mapRecords) {
  const edges = {};
  const add = (from, to, name, x, y) => {
    const list = (edges[from] ||= []);
    if (list.some(edge => edge[0] === to && edge[1] === name && edge[2] === x && edge[3] === y)) return;
    list.push([to, name, x, y]);
  };
  for (const [key, raw] of Object.entries(v83Maps || {})) {
    const from = Number(key);
    for (const [to, portalName, targetName, type, x, y] of raw.p || []) {
      if (!mapRecords[to] || to === from) continue;
      add(from, to, portalName || "", x, y);
      if (type === 2 || type === 3) add(to, from, targetName || "", 0, 0);
    }
  }
  return edges;
}

/** 上游沒名字的 NPC 是「NPC 1063013」這種 */
const UNNAMED_NPC = /^NPC \d+$/;
/** graph.json 裡 NPC 傳送（傑夫）那條邊的門名開頭：不算門 */
const NPC_WARP = "npc:";
/**
 * 地圖上只畫站上去按上鍵進得去的門：上游 portals 的 pt 1（沒有門的圖示，多半是畫在背景上的建築入口）、pt 2（有圖示的門）。
 * 其他（0 出生點、3 踩到就傳的掉落口、10 腳本門……）不畫座標，目的地照樣列。
 */
const PRESS_UP_DOORS = new Set([1, 2]);
/** 多收的圖（maps.json 沒 zh）遇到這些街名不收：隱藏地圖是任務、活動送進去的，航海中是坐船時的船艙 */
const EXTRA_SKIP_STREETS = new Set(["隱藏地圖", "航海中"]);

/**
 * @param {{
 *   upstreamMaps: Record<string, object> | object[],
 *   mapRecords: Record<string, { zh?: string, st?: string, t?: 1, ret?: number }>,
 *   graphEdges: Record<string, Array<[number, string, number, number, number?]>>,
 *   portalEdges?: Record<string, Array<[number, string, number, number]>>,
 *   items: Array<{ id: number, c?: string, s?: string, sp?: Array<{ p: string, n?: string, m?: number, pr: number, k?: number, u?: string, e?: string }> }>,
 *   quests: Array<{ id: string | number, n: string, sNpc?: { id: number }, eNpc?: { id: number }, npcs?: Array<{ id: number }> }>,
 *   monsterIds: Set<number>,
 *   npcImageIds: Set<number>,
 *   openRegions: string[],
 *   heldBackMaps: Map<number, string> | Set<number>,
 * }} input
 */
export function buildAtlas({ upstreamMaps, mapRecords, graphEdges, portalEdges = {}, items, quests, monsterIds, npcImageIds, openRegions, heldBackMaps }) {
  const upstream = new Map();
  for (const raw of Array.isArray(upstreamMaps) ? upstreamMaps : Object.values(upstreamMaps || {})) {
    const id = Number(raw?.id);
    if (Number.isFinite(id)) upstream.set(id, raw);
  }

  // 先挑出符合收圖規則的圖，再把怪、NPC、門都沒有的拿掉；
  // 門的目的地名會看「有沒有收進來」，拿掉一張可能讓別張圖的門變少，所以反覆算到不再變
  let kept = new Map();
  for (const [id, raw] of upstream) {
    if (!isOpen(id, raw, mapRecords, openRegions, heldBackMaps)) continue;
    kept.set(id, mapName(id, raw, mapRecords));
  }
  let maps;
  for (;;) {
    maps = [...kept.keys()].sort((a, b) => a - b)
      .map(id => buildMap(id, upstream.get(id), kept, { mapRecords, graphEdges, portalEdges, monsterIds }));
    const next = new Map(maps.filter(map => keepMap(map, mapRecords)).map(map => [map.id, kept.get(map.id)]));
    if (next.size === kept.size) break;
    kept = next;
  }

  const npcs = buildNpcs(maps, { items, quests, npcImageIds });
  return {
    maps,
    npcs,
    index: { maps: maps.map(map => map.id), npcs: npcs.map(npc => npc.id) },
  };
}

/**
 * 收進來的圖算完門之後還留不留：怪、NPC、門都沒有的不留。
 * 多收的圖（maps.json 沒 zh）另外要有門：沒有門的是只靠 NPC、任務送進去的房間（2 轉考驗場這種）。
 */
function keepMap(map, mapRecords) {
  if (mapRecords[String(map.id)]?.zh) return Boolean(map.mobs.length || map.npcs.length || map.doors.length);
  return map.doors.length > 0;
}

function isOpen(id, raw, mapRecords, openRegions, heldBackMaps) {
  if (mapRecords[String(id)]?.zh) return true;
  if (!raw.name || raw.unnamed) return false;
  if (heldBackMaps?.has(id)) return false;
  if (EXTRA_SKIP_STREETS.has(raw.street)) return false;
  return Boolean(raw.regionName) && openRegions.includes(raw.regionName);
}

/** 圖名用上游 name；上游沒名字（官方補過名字的城鎮）才用 maps.json 的 zh */
function mapName(id, raw, mapRecords) {
  return (!raw.unnamed && raw.name) || mapRecords[String(id)]?.zh || "";
}

function buildMap(id, raw, kept, { mapRecords, graphEdges, portalEdges, monsterIds }) {
  const record = mapRecords[String(id)] || {};
  const map = {
    id,
    n: kept.get(id),
    st: raw.street || record.st || "",
    rg: raw.regionName || "",
  };
  if (record.t) map.t = 1;
  const ret = Number(record.ret);
  if (Number.isFinite(ret) && ret !== id && (kept.has(ret) || mapRecords[String(ret)]?.zh)) map.ret = ret;
  const bounds = raw.renderedMap?.bounds;
  if (bounds && [bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite)) {
    map.b = [bounds.left, bounds.top, bounds.width, bounds.height];
  }
  map.mobs = groupMobs(raw.monsterSpawns, monsterIds);
  map.npcs = mapNpcs(raw.npcSpawns);
  // graph.json 同一個目的地只留一條邊（帶我去用），每個門的座標要從 portalEdges（doorEdges 算的）補
  const edges = [...(graphEdges[String(id)] || []), ...(portalEdges[String(id)] || [])];
  map.doors = mapDoors(id, raw.portals, edges, kept, mapRecords);
  return map;
}

/** 刷怪點依怪分組：數量＝刷怪點數，同數量照上游先出現的排前面 */
function groupMobs(spawns, monsterIds) {
  const byId = new Map();
  for (const spawn of spawns || []) {
    const id = Number(spawn?.monsterId);
    if (!Number.isFinite(id)) continue;
    let mob = byId.get(id);
    if (!mob) {
      mob = { id, n: spawn.name || "", lv: Number(spawn.level) || 0, k: 0, p: [] };
      if (monsterIds.has(id)) mob.pg = 1;
      byId.set(id, mob);
    }
    mob.k += 1;
    mob.p.push([Number(spawn.x) || 0, Number(spawn.y) || 0]);
  }
  return [...byId.values()].sort((a, b) => b.k - a.k);
}

function isNamedNpc(spawn) {
  return Boolean(spawn?.name) && !spawn.unnamed && !UNNAMED_NPC.test(spawn.name) && Number.isFinite(Number(spawn.npcId));
}

/** 這張圖的 NPC：沒名字的不收，同一個 NPC 只留第一個位置 */
function mapNpcs(spawns) {
  const seen = new Set();
  const list = [];
  for (const spawn of spawns || []) {
    if (!isNamedNpc(spawn)) continue;
    const id = Number(spawn.npcId);
    if (seen.has(id)) continue;
    seen.add(id);
    list.push({ id, n: spawn.name, x: Number(spawn.x) || 0, y: Number(spawn.y) || 0 });
  }
  return list;
}

/**
 * 門：graph.json 的 [目的圖, 門名, x, y]，同一個目的地只列一次、每個門的座標都記。
 * 目的地名取收進 atlas 的名字，沒有就用 maps.json 的 zh，都沒有（沒開放）就不列。
 * 座標以台服客戶端為準（同「出怪以台服客戶端為準，v83 只當備援」）：
 *  - 上游這張圖有門清單：只畫門名在清單裡、而且是 pt 1、2（按上鍵進得去的門）的，座標用上游的；
 *    v83 才有的門名、pt 3／10 這類不是按上鍵進的門都不畫（目的地照樣列，p 可能是空的）。
 *  - 上游這張圖完全沒有門清單：才用 graph／v83 的座標；是 0,0 就不記座標（只進清單）。
 */
function mapDoors(id, portals, edges, kept, mapRecords) {
  const portalAt = new Map();
  for (const portal of portals || []) {
    if (!portal?.name || !PRESS_UP_DOORS.has(Number(portal.pt)) || portalAt.has(portal.name)) continue;
    portalAt.set(portal.name, [Number(portal.x) || 0, Number(portal.y) || 0]);
  }
  const hasUpstream = (portals || []).length > 0;
  const byTarget = new Map();
  for (const edge of edges || []) {
    const [to, name, x, y] = edge;
    if (String(name || "").startsWith(NPC_WARP)) continue;
    const target = Number(to);
    if (!Number.isFinite(target) || target === id) continue;
    const label = kept.get(target) || mapRecords[String(target)]?.zh;
    if (!label) continue;
    let door = byTarget.get(target);
    if (!door) {
      door = { to: target, n: label, p: [] };
      byTarget.set(target, door);
    }
    let point = portalAt.get(name);
    if (!point) {
      if (hasUpstream) continue;
      point = [Number(x) || 0, Number(y) || 0];
      if (point[0] === 0 && point[1] === 0) continue;
    }
    if (!door.p.some(([px, py]) => px === point[0] && py === point[1])) door.p.push(point);
  }
  return [...byTarget.values()];
}

/**
 * NPC 從收進來的圖彙整（只出現在沒收進來的圖上的不收，這樣「在哪」一定點得到地圖頁）。
 * 賣什麼：items.json 的 sp 用「NPC 名＋地圖」對上；活動店的 u、e 照帶，過期由前端藏（同查資料道具卡）。
 * 任務：sNpc、eNpc、npcs 有這個 id 的，照 quests.json 的順序、同名的不合併。
 */
function buildNpcs(maps, { items, quests, npcImageIds }) {
  const byId = new Map();
  for (const map of maps) {
    for (const spawn of map.npcs) {
      let npc = byId.get(spawn.id);
      if (!npc) {
        npc = { id: spawn.id, n: spawn.n, maps: [] };
        byId.set(spawn.id, npc);
      }
      if (!npc.maps.includes(map.id)) npc.maps.push(map.id);
    }
  }

  // 店：地圖 id → 這張圖上每一列 sp
  const shopByMap = new Map();
  for (const item of items || []) {
    for (const row of item.sp || []) {
      if (row.m === undefined) continue;
      const list = shopByMap.get(row.m) || [];
      list.push({ item, row });
      shopByMap.set(row.m, list);
    }
  }

  const questsByNpc = new Map();
  const addQuest = (npcId, quest, role) => {
    if (!byId.has(npcId)) return;
    const roles = questsByNpc.get(npcId) || new Map();
    const entry = roles.get(quest) || new Set();
    entry.add(role);
    roles.set(quest, entry);
    questsByNpc.set(npcId, roles);
  };
  for (const quest of quests || []) {
    if (quest.sNpc?.id !== undefined) addQuest(Number(quest.sNpc.id), quest, "s");
    if (quest.eNpc?.id !== undefined) addQuest(Number(quest.eNpc.id), quest, "e");
    for (const ref of quest.npcs || []) addQuest(Number(ref?.id ?? ref), quest, "x");
  }

  return [...byId.values()].sort((a, b) => a.id - b.id).map(npc => {
    npc.maps.sort((a, b) => a - b);
    const out = { id: npc.id, n: npc.n };
    if (npcImageIds.has(npc.id)) out.img = 1;
    out.maps = npc.maps;

    const shop = [];
    const seen = new Set();
    for (const mapId of npc.maps) {
      for (const { item, row } of shopByMap.get(mapId) || []) {
        if (!(row.n ? row.n === npc.n : String(row.p || "").includes(npc.n))) continue;
        const entry = { id: item.id, pr: row.pr };
        if (row.k) entry.k = row.k;
        if (row.u) entry.u = row.u;
        if (row.e) entry.e = row.e;
        entry.s = item.s || item.c || "";
        const key = JSON.stringify(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        shop.push(entry);
      }
    }
    if (shop.length) out.shop = shop;

    const roles = questsByNpc.get(npc.id);
    if (roles) {
      out.quests = [...roles].map(([quest, set]) => ({ id: quest.id, n: quest.n, r: questRole(set) }));
    }
    return out;
  });
}

function questRole(set) {
  if (set.has("s") && set.has("e")) return "接・交";
  if (set.has("s")) return "接";
  if (set.has("e")) return "交";
  return "相關";
}
