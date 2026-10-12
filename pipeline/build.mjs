/**
 * 把原始資料合成前端要用的正規化檔案。
 *
 *  data/raw/artale.json     Artale 客戶端匯出：怪物數值、掉落、道具、任務、技能（中文，玩家實際玩的版本）
 *  data/raw/v83-maps.json   v83 Map.wz：傳送門連線、回城點、世界地圖區域；台服客戶端沒有刷怪資料的地圖才用它的刷怪點
 *  data/raw/msio-maps.json  maplestory.io：只用來標記哪些地圖有小地圖圖檔（選用）
 *
 * 合的原則：中文名與遊戲數值一律以 Artale 為準；地圖拓樸用 v83；刷怪以台服客戶端為準，客戶端沒有的圖才用 v83 補。
 * 對不起來的一律標記，不猜、不補假值。
 *
 * 刷怪點與回生秒數以台服客戶端為準（上游 maps-data.js，見 lib/spawns.mjs）：
 * 2026-10-05 查到 197 張練功圖有 110 張的 v83 出怪跟台服對不上。
 * 同一隻怪在同一張圖好幾個刷怪點、回生秒數不同時，逐點合成一個等效秒數（不是取最大）。
 */
import fs from "node:fs";
import path from "node:path";
import { isClassicJob } from "./lib/classic-jobs.mjs";
import { compactElemental } from "./lib/elemental.mjs";
import { readJson, writeJson, humanBytes } from "./lib/http.mjs";
import { officialName } from "./lib/map-names.mjs";
import { shopRows } from "./lib/shops.mjs";
import { cleanSkillDesc, clientLevels, expiredOn, linkPrereqs, skillLevelText, splitPrereq } from "./lib/skill-text.mjs";
import { DEFAULT_RESPAWN_SECONDS, mergeSpawns, respawnSeconds, twSpawns } from "./lib/spawns.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "data", "raw");
const OUT = path.join(ROOT, "public", "data");

/**
 * 台服《新楓之谷：經典版》目前開放的範圍。
 *
 * 這不是 Artale，也不是 GMS Classic——是遊戲橘子代理、2026-07-29 上線的 V001，
 * 等級上限 100、只到二轉，地區只有楓之島與維多利亞島（含奇幻村、螞蟻礦坑）。
 *
 * 客戶端資產包含尚未開放的內容（神木村、玩具城、Lv.180 的怪、四轉技能都在裡面）。
 * 一張地圖要同時符合兩件事才算已開放：
 *
 *  1. 有中文名。沒有中文名的圖玩家在遊戲裡找不到，一律不收。
 *  2. 所在地區列在下面的 mapRegions。
 *
 * 開服時只看第 1 點就夠了（當時只有已開放的地圖帶中文名），但客戶端會在改版前
 * 先替下一批地區補上中文名：1.15 就先放了冰原雪域 48 張、廢礦 23 張，
 * V002（2026-10-15）開放冰原雪域（上游地區名，含天空之城）與廢礦，三轉、等級上限 120。
 * 官方若宣布某些地圖不開，照公告加回擋住的清單。所以多加第 2 點把關，
 * 免得推薦玩家去一個進不去的地方。
 *
 * mapRegions 用的是上游資料的 regionName。奇幻村、鯨魚號在上游是獨立地區，
 * 楓葉世界是「全地區都會出現」的活動怪用的。上游還沒分類（regionName 空白）的圖照舊放行。
 * 有中文名但地區不在清單裡的，建置時會列在 meta.heldBackRegions 與輸出訊息裡。
 *
 * 第 1 點也有反過來的缺口：地區已經開放，但城鎮自己的名字客戶端還沒補上
 * （天空之城、冰原雪域兩座城鎮本身在客戶端一直是「未命名地圖」，V002 開放後主推卡因此
 * 會寫「從未開放地圖走 N 張圖」）。這兩筆官方公告過的地名用 lib/map-names.mjs 的
 * officialName 補，客戶端一有名字就自動換掉；其他沒公告過的沒名字城鎮不補，照舊留白。
 */
const RELEASE = {
  version: "V002",
  operator: "遊戲橘子（NEXON Korea 授權）",
  launchedAt: "2026-07-29",
  levelCap: 120,
  maxAdvancementOrder: 3,
  regions: ["楓之島", "維多利亞島", "天空之城", "冰原雪域", "廢礦區"],
  mapRegions: ["楓之島", "維多利亞島", "奇幻村", "鯨魚號", "楓葉世界", "冰原雪域", "廢礦"],
  note: "客戶端資產含未開放內容，本站只保留已開放的部分：地圖要有中文名而且所在地區已開放，任務與職業以等級上限與轉職階段判斷。",
};

/**
 * V002 開機日（官方公告 https://maplestoryclassic.beanfun.com/bulletin?Bid=83849）。
 * 2026-10-06 用戶決定：資料現在就上正式機，不用等開機公告，但要讓玩家看得出冰原雪域／廢礦區／
 * 三轉／Lv.120 是這天才開放——帶這個日期的地圖，前端（src/lib/release.ts）會標「10/15 開放」，
 * 過了這天自動不再標，不用重新部署。
 */
const V002_OPEN_DATE = "2026-10-15";

/** 天空之城、冰原雪域這兩座城鎮客戶端一直沒給名字（officialName 補缺），region 查不到，直接認 id。 */
const V002_NAMED_TOWNS = new Set([200000000, 211000000]);

/** 這張圖算不算「V002 才放行」：上游地區是冰原雪域或廢礦的已開放地圖，或天空之城／冰原雪域這兩座補缺的城鎮本身。 */
function v002OpenDate(id, zh) {
  if (V002_NAMED_TOWNS.has(id)) return V002_OPEN_DATE;
  if (zh?.region === "冰原雪域" || zh?.region === "廢礦") return V002_OPEN_DATE;
  return undefined;
}

function main() {
  const artale = readJson(path.join(RAW, "artale.json"));
  const v83 = readJson(path.join(RAW, "v83-maps.json"));
  const msio = readJson(path.join(RAW, "msio-maps.json"), null);
  if (!artale) throw new Error("缺 data/raw/artale.json，先跑 npm run data:artale");
  if (!v83) throw new Error("缺 data/raw/v83-maps.json，先跑 npm run data:v83");

  fs.mkdirSync(OUT, { recursive: true });

  const allJobs = buildJobs(artale);
  const jobs = releasedJobs(allJobs);
  const { names: zhNames, heldBack } = collectChineseMapNames(artale);
  const regions = buildRegions(v83);
  const maps = buildMaps(v83, zhNames, regions, msio);
  const graph = buildGraph(v83, maps);
  const components = labelComponents(graph, maps);
  const nearestTown = computeNearestTowns(maps, graph, v83);
  const canonItem = itemAliases(artale);
  const twTable = twSpawns(artale.maps);
  const spawnTable = mergeSpawns(twTable, v83.maps);
  const monsters = buildMonsters(artale, spawnTable.spawns, maps, canonItem);
  const items = buildItems(artale, monsters, maps);
  const quests = buildQuests(artale, maps, allJobs, canonItem);
  const skills = buildSkills(artale, allJobs);
  const training = buildTraining(maps, spawnTable.spawns, monsters);
  const farming = buildFarmingIndex(items, monsters, maps);
  const search = buildSearch({ monsters, items, quests, skills, maps });

  const report = {};
  report["maps.json"] = write("maps.json", maps.records);
  report["graph.json"] = write("graph.json", graph.edges);
  report["regions.json"] = write("regions.json", regions.list);
  report["nearest-town.json"] = write("nearest-town.json", nearestTown);
  report["monsters.json"] = write("monsters.json", monsters.list);
  report["items.json"] = write("items.json", items.list);
  report["quests.json"] = write("quests.json", quests.list);
  report["skills.json"] = write("skills.json", skills.list);
  report["jobs.json"] = write("jobs.json", jobs);
  report["training.json"] = write("training.json", training);
  report["farming.json"] = write("farming.json", farming);
  report["search.json"] = write("search.json", search);

  const meta = {
    gameVersion: artale.metadata?.gameVersion ?? null,
    dataGeneratedAt: artale.metadata?.generatedAt ?? null,
    dataGeneratedAtText: artale.metadata?.generatedAtText ?? null,
    ingest: artale.ingest ?? null,
    // 上游六個資料檔各自的版本，gameVersion 取的是其中最新的
    parts: artale.metadata?.parts ?? undefined,
    mapSource: { source: v83.source, url: v83.sourceUrl, extractedAt: v83.extractedAt },
    release: RELEASE,
    // 客戶端已經有中文名、但所在地區還沒開放而被擋下來的地圖數
    heldBackRegions: heldBack,
    // 已開放地圖的刷怪資料，各有幾張用台服客戶端、幾張退回 v83（沒開放的圖不算，免得數字誤導）
    spawnSource: (() => {
      const open = Object.keys(spawnTable.spawns).filter(key => maps.records[key]?.zh);
      const client = open.filter(key => twTable.has(Number(key))).length;
      return { client, v83: open.length - client };
    })(),
    assumptions: {
      defaultRespawnSeconds: DEFAULT_RESPAWN_SECONDS,
      expNote: "本站不提供每小時經驗值——那需要知道你的清怪速度。提供的是可查證的事實：一輪清完的總經驗、刷怪點數、回生秒數，以及據此換算的相對效率指數。",
      dropNote: "官方未公開掉落機率，本站不提供百分比。打寶排序依據是同一張圖能同時收到幾個目標與刷怪密度。",
      routeNote: "路線來自客戶端傳送門資料。跨大陸需搭乘遊戲內交通工具，會標成獨立一步。",
    },
    counts: {
      monsters: monsters.list.length,
      items: items.list.length,
      quests: quests.list.length,
      skills: skills.list.length,
      maps: Object.keys(maps.records).length,
      mapsWithChineseName: Object.values(maps.records).filter(map => map.zh).length,
      portalEdges: Object.values(graph.edges).reduce((sum, list) => sum + list.length, 0),
      towns: Object.values(maps.records).filter(map => map.t).length,
      regions: regions.list.length,
      walkableAreas: components.count,
      trainingMaps: training.length,
      farmableItems: Object.keys(farming).length,
    },
    coverage: {
      monstersWithSpawnData: monsters.withSpawnData,
      monstersWithoutSpawnData: monsters.list.length - monsters.withSpawnData,
      largestWalkableArea: components.largest,
    },
    builtAt: new Date().toISOString(),
  };
  report["meta.json"] = write("meta.json", meta, true);

  console.log("=== 輸出 ===");
  for (const [name, size] of Object.entries(report)) console.log(`  ${name.padEnd(18)} ${humanBytes(size)}`);
  console.log("\n=== 統計 ===");
  console.log(JSON.stringify(meta.counts, null, 2));
  console.log(JSON.stringify(meta.coverage, null, 2));
  if (Object.keys(heldBack).length) {
    console.log("\n=== 有中文名但地區尚未開放，沒有收錄 ===");
    for (const [region, count] of Object.entries(heldBack)) console.log(`  ${region.padEnd(8)} ${count} 張`);
    console.log("  官方開放後，把地區名加進 RELEASE.mapRegions 再重建。");
  }
}

function write(name, value, pretty = false) {
  return writeJson(path.join(OUT, name), value, { pretty });
}

/* ------------------------------------------------------------------ 職業 */

/** 職業代碼對照從技能資料反推——那是唯一同時有代碼與中文名的地方。 */
function buildJobs(artale) {
  const byId = new Map();
  for (const skill of artale.skills || []) {
    const id = Number(skill.jobId);
    if (!Number.isFinite(id) || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: skill.jobName || "",
      group: skill.jobGroup || "",
      groupOrder: skill.jobGroupOrder ?? 99,
      adv: skill.advancement || "",
      advOrder: skill.advancementOrder ?? 99,
    });
  }
  return [...byId.values()].sort((a, b) =>
    a.groupOrder - b.groupOrder || a.advOrder - b.advOrder || a.id - b.id);
}

/** 玩家選單只列得到的職業：開放到第幾轉看 RELEASE.maxAdvancementOrder（V002 是三轉），管理與活動用的也不算職業。 */
function releasedJobs(jobs) {
  return jobs.filter(job =>
    job.advOrder <= RELEASE.maxAdvancementOrder
    && !job.group.includes("管理")
    && !job.group.includes("特殊"));
}

/* ------------------------------------------------------------------ 地圖 */

function collectChineseMapNames(artale) {
  const zh = new Map();
  const held = new Map();
  const absorb = entry => {
    if (!entry || entry.unnamed) return;
    const id = Number(entry.id);
    if (!Number.isFinite(id) || zh.has(id)) return;
    // 上游還沒分類的圖（regionName 空白）照舊放行，有分類的要在已開放清單裡
    if (entry.regionName && !RELEASE.mapRegions.includes(entry.regionName)) {
      held.set(id, entry.regionName);
      return;
    }
    zh.set(id, {
      name: entry.name || "",
      street: entry.street || "",
      mark: entry.markKey || "",
      region: entry.regionName || "",
    });
  };
  for (const monster of artale.monsters || []) for (const map of monster.maps || []) absorb(map);
  for (const quest of artale.quests || []) {
    for (const key of ["startNpc", "endNpc"]) for (const map of quest[key]?.maps || []) absorb(map);
  }
  const heldBack = {};
  for (const region of held.values()) heldBack[region] = (heldBack[region] || 0) + 1;
  return { names: zh, heldBack };
}

/** 世界地圖 → 每張地圖屬於哪個區域，以及它在世界地圖上的座標。 */
function buildRegions(v83) {
  const list = [];
  const mapToRegion = new Map();
  const titleOf = new Map();

  // 母地圖（WorldMap.img）的 spot 帶有大陸標題，先收起來當名稱來源
  for (const region of v83.regions || []) {
    for (const spot of region.spots) {
      if (spot.title) for (const mapId of spot.maps) titleOf.set(mapId, spot.title);
    }
  }

  for (const region of v83.regions || []) {
    if (!region.parent) continue; // WorldMap.img 本身是總表，不算一個區域
    const maps = [];
    const spots = [];
    for (const spot of region.spots) {
      for (const mapId of spot.maps) {
        maps.push(mapId);
        if (!mapToRegion.has(mapId)) mapToRegion.set(mapId, region.key);
      }
      spots.push([spot.maps[0], spot.x ?? 0, spot.y ?? 0]);
    }
    const title = maps.map(id => titleOf.get(id)).find(Boolean) || region.key;
    list.push({ key: region.key, title, maps: [...new Set(maps)], spots });
  }
  return { list, mapToRegion };
}

function buildMaps(v83, zhNames, regions, msio) {
  const records = {};
  const hasMinimap = new Set(msio ? Object.keys(msio.maps).filter(id => msio.maps[id].mm) : []);

  // 客戶端的 town 旗標有 1290 張圖是 1，那不是「城鎮」而是「可在此復活」的旗標。
  // 玩家心裡的城鎮 = 別的地圖會回到這裡的那個點，所以用 returnMap 的目標集合來認定。
  const townSet = new Set();
  for (const raw of Object.values(v83.maps)) if (raw.ret) townSet.add(raw.ret);

  const ids = new Set([...Object.keys(v83.maps), ...[...zhNames.keys()].map(String)]);
  for (const key of ids) {
    const id = Number(key);
    const raw = v83.maps[key] || {};
    const zh = zhNames.get(id);

    // 只輸出中文。上游沒給中文名的地圖就留空——與其顯示玩家在遊戲裡
    // 根本找不到的英文名（或別的版本翻錯的中文名），不如誠實留白。
    // 客戶端沒給名字時查 officialName 的補缺表（目前只有天空之城、冰原雪域兩筆官方公告過的城鎮名）；
    // 客戶端一有名字（改版後補上）就自動換成客戶端的，不在表裡的照舊留空。
    const record = {
      zh: officialName(id, zh?.name),
      st: zh?.street || "",
      t: townSet.has(id) ? 1 : undefined,
      ret: raw.ret,
      mk: zh?.mark || raw.mk || undefined,
      rg: regions.mapToRegion.get(id) || undefined,
      rate: raw.rate,
      mm: hasMinimap.has(key) ? 1 : undefined,
      o: v002OpenDate(id, zh),
    };
    for (const field of Object.keys(record)) if (record[field] === undefined) delete record[field];
    records[id] = record;
  }
  return { records };
}

/**
 * 傳送門圖。走得過去的門原則上走得回來，所以一般傳送門（pt 2、3）建成雙向；
 * 只有腳本型／單向門保持有向，避免規劃出走不通的路。
 */
function buildGraph(v83, maps) {
  const edges = {};
  const addEdge = (from, to, name, x, y) => {
    const list = (edges[from] ||= []);
    if (list.some(edge => edge[0] === to)) return;
    list.push([to, name, x, y]);
  };

  for (const [key, raw] of Object.entries(v83.maps)) {
    const from = Number(key);
    for (const [to, portalName, targetName, type, x, y] of raw.p || []) {
      if (!maps.records[to] || to === from) continue;
      addEdge(from, to, portalName || "", x, y);
      // pt 2/3 是玩家走進去的一般門，反向必然存在；其餘（腳本、隱藏）不臆測
      if (type === 2 || type === 3) addEdge(to, from, targetName || "", 0, 0);
    }
  }
  return { edges };
}

/** 標出各個「走得到彼此」的區塊，跨區塊就是要搭船／計程車。 */
function labelComponents(graph, maps) {
  const seen = new Set();
  let count = 0;
  let largest = 0;
  for (const key of Object.keys(maps.records)) {
    const start = Number(key);
    if (seen.has(start)) continue;
    count += 1;
    let size = 0;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const current = stack.pop();
      size += 1;
      for (const [next] of graph.edges[current] || []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    largest = Math.max(largest, size);
  }
  return { count, largest };
}

/**
 * 每張圖的預設出發城鎮。
 * 客戶端的 returnMap 就是玩家死掉／回城會到的那個點，直接拿來用最準；
 * 沒有 returnMap 的圖再從所有城鎮做一次反向 BFS 找最近的。
 */
function computeNearestTowns(maps, graph, v83) {
  const result = {};
  for (const [key, raw] of Object.entries(v83.maps)) {
    if (raw.ret && maps.records[raw.ret] && raw.ret !== Number(key)) result[key] = [raw.ret, 0];
  }

  const reverse = {};
  for (const [from, list] of Object.entries(graph.edges)) {
    for (const [to] of list) (reverse[to] ||= []).push(Number(from));
  }
  const queue = [];
  for (const [key, record] of Object.entries(maps.records)) {
    if (!record.t) continue;
    result[key] = [Number(key), 0];
    queue.push(Number(key));
  }
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const [town, distance] = result[current];
    for (const previous of reverse[current] || []) {
      if (result[previous]) continue;
      result[previous] = [town, distance + 1];
      queue.push(previous);
    }
  }
  return result;
}

/* ---------------------------------------------------------------- 怪物 */

function buildMonsters(artale, spawns, maps, canonItem) {
  // 反查：怪物 id → 出現在哪些地圖、各幾個刷怪點、回生秒數（台服客戶端優先，見 lib/spawns.mjs）
  const spawnOf = new Map();
  for (const [key, list] of Object.entries(spawns)) {
    for (const [mobId, count, mobTime] of list) {
      if (!spawnOf.has(mobId)) spawnOf.set(mobId, []);
      spawnOf.get(mobId).push([Number(key), count, mobTime || 0]);
    }
  }

  const released = new Set(
    Object.entries(maps.records).filter(([, record]) => record.zh).map(([key]) => Number(key)),
  );

  let withSpawnData = 0;
  const list = (artale.monsters || [])
    // 只有出現在已開放地圖上的怪才算進得去；其餘是客戶端裡尚未開放的內容
    .filter(monster => (monster.maps || []).some(map => released.has(Number(map.id))))
    // 地圖開放不代表圖裡的怪都在等級上限內：廢礦區的代表地圖「殘暴炎魔祭壇」開放後，
    // 跟著漏進 22 隻 Lv.140 的殘暴炎魔／混沌殘暴炎魔（遠超 V002 上限 120），這是之後才會解鎖的首領戰內容。
    // 比照任務（quest.minLevel ≤ RELEASE.levelCap）同樣用等級上限把關，地圖本身照樣收錄（REGION_SENTINELS 要看得到它有中文名）。
    .filter(monster => (monster.level ?? monster.stats?.level ?? 0) <= RELEASE.levelCap)
    .map(monster => {
    const id = Number(monster.id);
    const stats = monster.stats || {};
    const declaredMaps = (monster.maps || []).map(map => Number(map.id)).filter(Number.isFinite);
    const spawnRows = spawnOf.get(id) || [];
    if (spawnRows.length) withSpawnData += 1;

    const record = {
      id,
      n: monster.name || "",
      un: monster.unnamed ? 1 : undefined,
      lv: monster.level ?? stats.level ?? null,
      exp: stats.exp ?? 0,
      hp: stats.maxHP ?? 0,
      pad: stats.PADamage ?? 0,
      pdd: stats.PDDamage ?? 0,
      mad: stats.MADamage ?? 0,
      mdd: stats.MDDamage ?? 0,
      acc: stats.acc ?? 0,
      eva: stats.eva ?? 0,
      spd: stats.speed ?? 0,
      und: stats.undead ? 1 : undefined,
      el: compactElemental(monster.elemental, `${id} ${monster.name || ""}`),
      maps: declaredMaps,
      sp: spawnRows.length ? spawnRows : undefined,
      drops: [...new Set((monster.drops || []).map(drop => canonItem(Number(drop.id))).filter(Number.isFinite))],
    };
    for (const field of Object.keys(record)) if (record[field] === undefined) delete record[field];
    return record;
  });

  return { list, withSpawnData, byId: new Map(list.map(monster => [monster.id, monster])) };
}

/* ---------------------------------------------------------------- 道具 */

/**
 * 舊道具編號 → 道具表裡的編號。
 *
 * 上游 1.15 起把同名的道具併成一筆，被併掉的編號列在保留那筆的 mergedIds，
 * 不再單獨出現在道具表（例如紅夢褲 1061029 併進 1060022）。
 * 但怪物掉落與任務條件還是寫原本的編號，不換過來前端會顯示成查不到的道具。
 */
function itemAliases(artale) {
  const alias = new Map();
  for (const item of artale.items || []) {
    const keep = Number(item.id);
    for (const merged of item.mergedIds || []) {
      const id = Number(merged);
      if (Number.isFinite(id) && id !== keep) alias.set(id, keep);
    }
  }
  return id => alias.get(id) ?? id;
}

function buildItems(artale, monsters, maps) {
  const list = (artale.items || []).map(item => {
    const sources = item.sources || {};
    const record = {
      id: Number(item.id),
      n: item.name || "",
      d: item.desc || undefined,
      c: item.category || "",
      s: item.subcategory || undefined,
      un: item.unnamed ? 1 : undefined,
      eq: compactEquip(item.equipStats),
      // 每種來源的識別欄位名稱不同（monsterId / questId / recipeId），不能一律當 id 抓
      dm: pluckIds(sources.monsterDrops, "monsterId")?.filter(id => monsters.byId.has(id)),
      qr: pluckStrings(sources.questRewards, "questId"),
      qq: pluckStrings(sources.questRequirements, "questId"),
      sh: sources.shops?.length || undefined,
      // 哪裡買得到：只列經典版已經開放的地方；NPC 商店大多是舊版資料，前端會標出來（見 lib/shops.mjs）
      sp: shopRows(sources.shops, { openRegions: RELEASE.mapRegions, mapRecords: maps.records }),
      cf: pluckIds(sources.crafts, "recipeId"),
      // 商店最高售價，拿來估「撿了值不值得」。這是 NPC 店家的標價，不是玩家間的行情。
      price: shopPrice(sources.shops),
    };
    for (const field of Object.keys(record)) {
      const value = record[field];
      if (value === undefined || (Array.isArray(value) && !value.length)) delete record[field];
    }
    return record;
  });
  return { list, byId: new Map(list.map(item => [item.id, item])) };
}

/**
 * NPC 商店的最高單價。同一個道具在不同店家可能不同價，取最高的當參考。
 *
 * 有些店是整組賣（通行證遠端商店：箭矢 2000 支 1400），要除以組數才是一個的價錢。
 * 上游標成 hiddenByDefault 的是「非本期限時售價」，現在買不到這個價，不算。
 */
function shopPrice(shops) {
  if (!Array.isArray(shops) || !shops.length) return undefined;
  const prices = shops
    .filter(shop => !shop?.hiddenByDefault)
    .map(shop => (Number(shop?.price) || 0) / Math.max(Number(shop?.count) || 1, 1))
    .map(price => Math.round(price * 100) / 100)
    .filter(price => price > 0);
  return prices.length ? Math.max(...prices) : undefined;
}

function pluckIds(rows, key = "id") {
  if (!Array.isArray(rows) || !rows.length) return undefined;
  const ids = [...new Set(rows.map(row => Number(row?.[key] ?? row?.id ?? row)).filter(Number.isFinite))];
  return ids.length ? ids : undefined;
}

function pluckStrings(rows, key = "id") {
  if (!Array.isArray(rows) || !rows.length) return undefined;
  const ids = [...new Set(rows.map(row => String(row?.[key] ?? row?.id ?? row)).filter(value => value && value !== "undefined"))];
  return ids.length ? ids : undefined;
}

function compactEquip(stats) {
  if (!stats) return undefined;
  const keep = ["reqLevel", "reqJob", "reqSTR", "reqDEX", "reqINT", "reqLUK", "incSTR", "incDEX",
    "incINT", "incLUK", "incMHP", "incMMP", "incPAD", "incMAD", "incPDD", "incMDD",
    "incACC", "incEVA", "incSpeed", "incJump", "tuc", "islot", "attackSpeed"];
  const out = {};
  for (const key of keep) {
    const value = stats[key];
    if (value !== undefined && value !== null && value !== 0 && value !== "") out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/* ---------------------------------------------------------------- 任務 */

function buildQuests(artale, maps, jobs, canonItem) {
  const advOf = new Map(jobs.map(job => [job.id, job.advOrder]));
  const reachableJob = (codes) => {
    if (!codes?.length) return true;
    // 職業代碼查不到轉職階段時不擋，寧可多列也不要漏掉不限職業的任務
    return codes.some(code => (advOf.get(code) ?? 0) <= RELEASE.maxAdvancementOrder);
  };

  const list = (artale.quests || [])
    .filter(quest => (quest.minLevel ?? 0) <= RELEASE.levelCap)
    .filter(quest => reachableJob(quest.startRequirements?.jobs))
    .map(quest => {
    const start = quest.startRequirements || {};
    const complete = quest.completeRequirements || {};
    const rewards = quest.completeRewards || {};
    const startRewards = quest.startRewards || {};
    return dropEmpty({
      id: String(quest.id),
      n: quest.name || "",
      cat: quest.category || "",
      parent: quest.parent || undefined,
      minLv: quest.minLevel ?? undefined,
      maxLv: quest.maxLevel ?? undefined,
      jobs: start.jobs?.length ? start.jobs : undefined,
      pre: start.quests?.length ? start.quests.map(entry => String(entry.id ?? entry)) : undefined,
      next: quest.nextQuest ? String(quest.nextQuest) : undefined,
      sNpc: npcRef(quest.startNpc, maps),
      eNpc: npcRef(quest.endNpc, maps),

      // 完成條件
      needItems: rowRefs(complete.items, canonItem),
      needMobs: rowRefs(complete.monsters),

      // 接取條件：有些任務要先帶著道具、或先練到某個技能才接得到
      startItems: rowRefs(start.items, canonItem),
      startSkills: skillRefs(start.skills),

      // 獎勵。接受時就給的跟完成才給的分開，不要混成一筆
      exp: rewards.exp ?? undefined,
      money: rewards.money ?? undefined,
      pop: rewards.pop ?? undefined,
      rewardItems: rewardRefs(rewards.items, canonItem),
      rewardSkills: skillRefs(rewards.skills),
      startExp: startRewards.exp ?? undefined,
      startGiven: rewardRefs(startRewards.items, canonItem),

      medal: quest.medalCategory || undefined,

      // 起始地圖在楓之島（地圖編號小於一億就是楓之島）。
      // 離島之後回不去，所以這些任務對已轉職的角色沒有意義。
      island: onMapleIsland(quest.startNpc) ? 1 : undefined,

      // 任務敘述是「可接／進行中／完成後」三段的陣列，先前被當成物件而整段沒顯示出來
      texts: questTexts(quest.texts),

      // 這個任務牽涉到的其他 NPC，不只起訖兩個
      npcs: relatedNpcs(quest, maps),
    });
  });
  return { list };
}

/**
 * 任務敘述。原文照留。
 * 曾經把內文的「未命名地圖 211000001」換成 v83 的英文名，但玩家在遊戲裡看到的是中文，
 * 英文名對他沒有用；別的版本的中文名又對不上這版的地圖。沒有正確中文就不要亂填。
 */
function questTexts(texts) {
  if (!Array.isArray(texts) || !texts.length) return undefined;
  const rows = texts
    .filter(entry => entry?.text)
    .map(entry => ({
      k: String(entry.key ?? ""),
      label: entry.label || "",
      text: String(entry.text),
    }));
  return rows.length ? rows : undefined;
}

/**
 * 楓之谷的地圖編號規則：region = 編號 ÷ 一億。楓之島是第 0 區，
 * 所以編號小於一億（楓之路 40000、楓葉村 1010004、楓之港口 2000000）都算楓之島。
 */
function onMapleIsland(npc) {
  const mapId = Number(npc?.maps?.[0]?.id);
  return Number.isFinite(mapId) && mapId < 100000000;
}

function skillRefs(rows) {
  if (!Array.isArray(rows) || !rows.length) return undefined;
  const ids = rows.map(row => Number(row?.id ?? row)).filter(Number.isFinite);
  return ids.length ? ids : undefined;
}

function relatedNpcs(quest, maps) {
  const startId = Number(quest.startNpc?.id);
  const endId = Number(quest.endNpc?.id);
  const seen = new Map();
  for (const npc of quest.refs?.npcs || []) {
    const id = Number(npc?.id);
    if (!Number.isFinite(id) || id === startId || id === endId || seen.has(id)) continue;
    seen.set(id, npcRef(npc, maps));
  }
  return seen.size ? [...seen.values()] : undefined;
}

function npcRef(npc, maps) {
  if (!npc) return undefined;
  const mapId = Number(npc.maps?.[0]?.id);
  const record = Number.isFinite(mapId) ? maps.records[mapId] : null;
  return dropEmpty({
    id: Number(npc.id),
    n: npc.name || "",
    map: Number.isFinite(mapId) ? mapId : undefined,
    mapName: record ? record.zh || record.en || "" : undefined,
  });
}

/** canon 只給道具用（換成道具表裡的編號）；怪物需求不要經過它。 */
function rowRefs(rows, canon = id => id) {
  if (!Array.isArray(rows) || !rows.length) return undefined;
  return rows.map(row => dropEmpty({ id: canon(Number(row.id)), n: row.name || "", c: row.count ?? undefined }));
}

/**
 * 獎勵道具。
 *
 * 客戶端把「給你」跟「收走」放在同一個獎勵清單裡，靠 action 分辨——
 * 847 筆裡有 387 筆是 action=remove，那是完成時被收走的任務道具，不是獎勵。
 * 全部照列會讓玩家以為拿得到一堆根本不會進背包的東西。
 *
 * 另外 250 筆是 random（一堆裡隨機給一樣）、167 筆綁職業，這兩種都標記起來，
 * 前端才有辦法照實說「隨機給一樣」而不是「這些全拿」。
 */
function rewardRefs(rows, canon = id => id) {
  if (!Array.isArray(rows) || !rows.length) return undefined;
  const kept = rows
    .filter(row => row?.action !== "remove")
    .map(row => dropEmpty({
      id: canon(Number(row.id)),
      n: row.name || "",
      c: row.count ?? undefined,
      rand: row.random ? 1 : undefined,
      job: row.job || undefined,
    }));
  return kept.length ? kept : undefined;
}

function dropEmpty(object) {
  for (const key of Object.keys(object)) {
    const value = object[key];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) {
      delete object[key];
    }
  }
  return object;
}

/* ---------------------------------------------------------------- 技能 */

/** 建置當天（台灣時間 "YYYY-MM-DD"）：活動技能寫的有效期限比這天早就算到期 */
const TODAY = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function buildSkills(artale, allJobs) {
  const advOf = new Map(allJobs.map(job => [job.id, job.advOrder]));
  const clientSkills = readJson(path.join(ROOT, "data", "client", "skills.json"), { skills: {} }).skills;
  // 台服客戶端每個技能的所需技能（id → 等級）：遊戲說明有 20 個名字寫錯，照 id 接連結（scripts/client/skill-req.mjs 抽的）
  const clientReq = readJson(path.join(ROOT, "data", "client", "skill-req.json"), { req: {} }).req;
  const list = (artale.skills || [])
    // 只收經典版實際存在的職業（見 lib/classic-jobs.mjs）：客戶端資料另外還有皇家騎士團、
    // 狂狼勇士、龍魔導士、影武者，經典版沒有這些職業，列出來查資料頁的職業選單會選得到
    // 一個經典版不存在的職業（2026-10-06 使用者回報的「正式機還沒看到三轉資料？」就是這樣）
    .filter(skill => isClassicJob(Number(skill.jobId)))
    // 三轉四轉的技能現在學不到，列出來只會讓人以為練得到
    .filter(skill => (advOf.get(Number(skill.jobId)) ?? 9) <= RELEASE.maxAdvancementOrder)
    // 說明寫著早就到期的活動技能（宇宙衝鋒「有效時間：2009年6月8日00時」等 4 個）經典版拿不到，不列（2026-10-08 使用者「全修」）
    .filter(skill => {
      const end = expiredOn(skill.description);
      return !end || end >= TODAY;
    })
    .map(skill => ({
      skill,
      ...splitPrereq(cleanSkillDesc(skill.description, skill.maxLevel ?? undefined)),
      // 上游沒給每一級數值、台服客戶端有的（衝鋒），數值跟表頭用客戶端的（data/client/skills.json）
      ...clientLevels(skill.levels, clientSkills[skill.id], `${skill.id} ${skill.name}`),
    }))
    .map(({ skill, desc, req, levels, labels }) => dropEmpty({
    id: Number(skill.id),
    n: skill.name || "",
    job: Number(skill.jobId),
    jobName: skill.jobName || "",
    group: skill.jobGroup || "",
    adv: skill.advancement || "",
    max: skill.maxLevel ?? undefined,
    // 說明尾巴的「所需技能：魔天一擊1等級以上」拆成 req，卡片另外列一行、做成連結（id 下面 linkPrereqs 接）
    desc,
    req,
    formula: skill.formula || undefined,
    labels: labels || skill.valueLabels || undefined,
    levels: (levels || []).map(level => level.values || {}),
    // 每一級的說明原文只留卡片用得到的級數（沒有數值的那幾級、最高級），見 lib/skill-text.mjs
    levelText: skillLevelText(levels, `${skill.id} ${skill.name}`),
  }));
  linkPrereqs(list, clientReq);
  // 所需技能還接不上連結的（2026-10-08 v0.80 起是 0 個）：變多代表上游說明或客戶端改版了，要看一下
  const unlinked = list.flatMap(skill => (skill.req ?? []).filter(req => !req.id).map(req => `${skill.id} ${skill.n}→${req.name}`));
  if (unlinked.length) console.log(`[skills] 所需技能接不上連結的：${unlinked.length} 個（${unlinked.join("、")}）`);
  // 說明是韓文、建置時拿掉的有幾個（2026-10-08 是 19 個坐騎）：數字突然變多代表上游換了語系，要看一下
  const korean = (artale.skills || []).filter(skill => list.some(item => item.id === Number(skill.id)) && /\p{Script=Hangul}/u.test(skill.description || ""));
  if (korean.length) console.log(`[skills] 說明是韓文、沒有列的：${korean.length} 個（效果行照列中文）`);
  return { list };
}

/* ------------------------------------------------------------ 練功索引 */

/**
 * 每張圖一列練功資料。
 *
 * 刻意不輸出「每小時經驗」這種數字：那需要知道玩家的清怪速度，我們不知道，
 * 硬算出來會是一分鐘上百萬經驗這種假數字。這裡只給可驗證的事實——
 * 一輪清完的總經驗、刷怪點數、回生秒數——外加一個純粹用來排序的密度值 eff，
 * 前端會把它換算成同等級帶內的相對指數再顯示。
 */
function buildTraining(maps, spawns, monsters) {
  const rows = [];
  for (const [key, list] of Object.entries(spawns)) {
    const mapId = Number(key);
    const record = maps.records[mapId];
    // 沒有中文名的地圖不進推薦——玩家在遊戲裡找不到它
    if (!record || !record.zh || !list?.length) continue;

    let totalSpawn = 0;
    let density = 0;
    let expPerClear = 0;
    let hpPerClear = 0;
    let levelWeighted = 0;
    let respawnWeighted = 0;
    let minLevel = Infinity;
    let maxLevel = -Infinity;
    let unknownSpawn = 0;
    const mobs = [];

    for (const [mobId, count, mobTime] of list) {
      const monster = monsters.byId.get(mobId);
      if (!monster || !monster.lv) {
        unknownSpawn += count;
        continue;
      }
      // 等效回生秒數（lib/spawns.mjs 逐點合成）；沒指定或比預設快的照預設 7 秒算，當保險
      const respawn = respawnSeconds(mobTime);
      totalSpawn += count;
      expPerClear += (monster.exp || 0) * count;
      hpPerClear += (monster.hp || 0) * count;
      density += ((monster.exp || 0) * count) / respawn;
      levelWeighted += monster.lv * count;
      respawnWeighted += respawn * count;
      minLevel = Math.min(minLevel, monster.lv);
      maxLevel = Math.max(maxLevel, monster.lv);
      mobs.push([mobId, count, mobTime || 0]);
    }
    if (!totalSpawn || !expPerClear) continue;

    rows.push({
      m: mapId,
      sp: totalSpawn,
      exp1: expPerClear,
      hp: hpPerClear,
      // 排序用的密度值：經驗 ÷ 回生秒數。不是每秒經驗，只有相對大小有意義。
      eff: Math.round(density * 100) / 100,
      resp: Math.round(respawnWeighted / totalSpawn),
      lv: Math.round(levelWeighted / totalSpawn),
      lvMin: minLevel,
      lvMax: maxLevel,
      // 這張圖有多少刷怪點是 Artale 圖鑑查不到的怪，UI 要照實標
      unk: unknownSpawn || undefined,
      mobs: mobs.sort((a, b) => b[1] - a[1]),
    });
  }
  for (const row of rows) if (row.unk === undefined) delete row.unk;
  return rows.sort((a, b) => b.eff - a.eff);
}

/* ------------------------------------------------------------ 打寶索引 */

/**
 * 道具 → 會掉的怪 → 怪出沒的地圖。
 * 沒有官方掉率，所以排序依據是刷怪密度與同圖目標數，也就是「一趟收最多」。
 */
function buildFarmingIndex(items, monsters, maps) {
  const byItem = {};
  for (const item of items.list) {
    const dropperIds = item.dm || [];
    if (!dropperIds.length) continue;
    const perMap = new Map();
    for (const monsterId of dropperIds) {
      const monster = monsters.byId.get(monsterId);
      if (!monster) continue;
      const spawns = monster.sp?.length
        ? monster.sp.map(([mapId, count]) => [mapId, count])
        : (monster.maps || []).map(mapId => [mapId, 0]);
      for (const [mapId, count] of spawns) {
        if (!maps.records[mapId]?.zh) continue;
        const bucket = perMap.get(mapId) || { mobs: [], spawn: 0 };
        bucket.mobs.push(monsterId);
        bucket.spawn += count;
        perMap.set(mapId, bucket);
      }
    }
    if (!perMap.size) continue;
    byItem[item.id] = [...perMap.entries()]
      .sort((a, b) => b[1].spawn - a[1].spawn || b[1].mobs.length - a[1].mobs.length)
      .slice(0, 30)
      .map(([mapId, bucket]) => [mapId, bucket.spawn, bucket.mobs]);
  }
  return byItem;
}

/* ------------------------------------------------------------ 搜尋索引 */

function buildSearch({ monsters, items, quests, skills, maps }) {
  const rows = [];
  for (const monster of monsters.list) {
    if (monster.un) continue;
    rows.push(["m", monster.id, monster.n, monster.lv ?? 0]);
  }
  for (const item of items.list) {
    if (item.un) continue;
    rows.push(["i", item.id, item.n, item.c]);
  }
  for (const quest of quests.list) rows.push(["q", quest.id, quest.n, quest.minLv ?? 0]);
  for (const skill of skills.list) rows.push(["s", skill.id, skill.n, skill.jobName]);
  for (const [key, record] of Object.entries(maps.records)) {
    if (!record.zh) continue;
    rows.push(["p", Number(key), record.zh, record.st || ""]);
  }
  return rows;
}

main();
