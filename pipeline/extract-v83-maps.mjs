/**
 * 從 v83 的 Map.wz XML 匯出抽出地圖拓樸。
 *
 * 為什麼不用 maplestory.io：實測它的 portal 序列化壞掉，3878 張圖只解得出 1054 條有向邊，
 * 從楓之島出發只走得到 21 張圖，根本不能導航。這份 XML 是完整的原始資料。
 *
 * 這裡拿到的東西：
 *   portal  傳送門與目標地圖 —— 導航的最短路徑就靠這個
 *   life    每個刷怪點的怪物 id 與 mobTime（回生秒數）—— 練功效率不用再靠估值
 *   info    回城點、城鎮旗標、mobRate、地圖標記
 *
 * v83 是凍結版本，抽一次就好，結果進版控。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { writeJson, humanBytes } from "./lib/http.mjs";

const ARCHIVE_URL = process.env.V83_XML_URL
  || "https://ia600107.us.archive.org/1/items/rulaxingcommunityrepackv1/xml.zip";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "data", "cache");
const ZIP = path.join(CACHE, "v83-xml.zip");
const XML_DIR = path.join(CACHE, "v83xml");
const MAP_DIR = path.join(XML_DIR, "wz", "Map.wz", "Map");
const WORLDMAP_DIR = path.join(XML_DIR, "wz", "Map.wz", "WorldMap");
const STRING_MAP = path.join(XML_DIR, "wz", "String.wz", "Map.img.xml");
const OUT_FILE = path.join(ROOT, "data", "raw", "v83-maps.json");

const NO_TARGET = 999999999;

function main() {
  ensureXml();

  const files = [];
  for (const bucket of fs.readdirSync(MAP_DIR)) {
    const dir = path.join(MAP_DIR, bucket);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (/^\d+\.img\.xml$/.test(name)) files.push(path.join(dir, name));
    }
  }
  console.log(`[v83] 解析 ${files.length} 張地圖 XML…`);

  const maps = {};
  let portalEdges = 0;
  let spawnRows = 0;
  for (const [index, file] of files.entries()) {
    const id = Number(path.basename(file).replace(".img.xml", ""));
    const xml = fs.readFileSync(file, "utf8");
    const record = parseMap(xml);
    if (!record) continue;
    maps[id] = record;
    portalEdges += record.p?.length || 0;
    spawnRows += record.m?.length || 0;
    if ((index + 1) % 800 === 0) console.log(`  …${index + 1}/${files.length}`);
  }

  const names = fs.existsSync(STRING_MAP) ? parseStringMap(fs.readFileSync(STRING_MAP, "utf8")) : {};
  console.log(`[v83] 地圖英文名 ${Object.keys(names).length} 筆`);

  const regions = parseWorldMaps();
  console.log(`[v83] 世界地圖 ${regions.length} 張，覆蓋 ${new Set(regions.flatMap(r => r.spots.flatMap(s => s.maps))).size} 張地圖`);

  const size = writeJson(OUT_FILE, {
    source: "MapleStory v83 Map.wz XML export",
    sourceUrl: ARCHIVE_URL,
    extractedAt: new Date().toISOString(),
    maps,
    names,
    regions,
  });

  console.log(`[v83] 完成：${Object.keys(maps).length} 張地圖、${portalEdges} 條傳送門邊、${spawnRows} 筆刷怪列，輸出 ${humanBytes(size)}`);
}

function ensureXml() {
  if (fs.existsSync(MAP_DIR)) {
    console.log("[v83] 已有解開的 XML，略過下載");
    return;
  }
  fs.mkdirSync(CACHE, { recursive: true });
  if (!fs.existsSync(ZIP)) {
    console.log(`[v83] 下載 ${ARCHIVE_URL}（約 90MB）…`);
    execFileSync("curl", ["-sL", "--max-time", "1800", "-o", ZIP, ARCHIVE_URL], { stdio: "inherit" });
  }
  console.log("[v83] 解壓地圖與字串…");
  execFileSync("unzip", [
    "-q", "-o", ZIP,
    "wz/Map.wz/Map/Map*/*.img.xml",
    "wz/Map.wz/WorldMap/*",
    "wz/String.wz/Map.img.xml",
    "-d", XML_DIR,
  ], { stdio: "inherit" });
}

/** 抓出某個 imgdir 區塊的完整內容（含巢狀），用括號配對而不是硬切。 */
function sliceBlock(xml, blockName) {
  const open = `<imgdir name="${blockName}">`;
  const start = xml.indexOf(open);
  if (start < 0) return "";
  let depth = 0;
  let cursor = start;
  const openTag = /<imgdir\b[^>]*>/g;
  const pattern = /<imgdir\b[^>]*>|<\/imgdir>/g;
  pattern.lastIndex = start;
  void openTag;
  let match;
  while ((match = pattern.exec(xml))) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        cursor = match.index + match[0].length;
        break;
      }
    } else {
      depth += 1;
    }
  }
  return xml.slice(start + open.length, cursor);
}

function readValue(chunk, name) {
  const match = chunk.match(new RegExp(`<\\w+ name="${name}" value="([^"]*)"`));
  return match ? decodeXml(match[1]) : undefined;
}

/**
 * XML 匯出會把符號跳脫，不解回來就會在畫面上看到
 * 「Chief&apos;s Residence」這種東西。
 */
function decodeXml(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_whole, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function splitEntries(block) {
  // 每個子項都是 <imgdir name="0">…</imgdir>，數字命名，逐一切開
  const entries = [];
  const pattern = /<imgdir name="(\d+)">/g;
  let match;
  const positions = [];
  while ((match = pattern.exec(block))) positions.push({ index: match.index, length: match[0].length });
  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i].index + positions[i].length;
    const end = i + 1 < positions.length ? positions[i + 1].index : block.length;
    entries.push(block.slice(start, end));
  }
  return entries;
}

function parseMap(xml) {
  const info = sliceBlock(xml, "info");
  if (!info) return null;

  const record = {};
  if (readValue(info, "town") === "1") record.t = 1;
  const ret = Number(readValue(info, "returnMap"));
  if (Number.isFinite(ret) && ret !== NO_TARGET) record.ret = ret;
  const forced = Number(readValue(info, "forcedReturn"));
  if (Number.isFinite(forced) && forced !== NO_TARGET) record.fr = forced;
  const rate = Number(readValue(info, "mobRate"));
  if (Number.isFinite(rate) && rate > 0) record.rate = Number(rate.toFixed(3));
  const mark = readValue(info, "mapMark");
  if (mark) record.mk = mark;
  const desc = readValue(info, "mapDesc");
  if (desc) record.desc = desc;
  const limit = Number(readValue(info, "fieldLimit"));
  if (Number.isFinite(limit) && limit > 0) record.fl = limit;

  const portals = [];
  for (const entry of splitEntries(sliceBlock(xml, "portal"))) {
    const target = Number(readValue(entry, "tm"));
    if (!Number.isFinite(target) || target === NO_TARGET) continue;
    portals.push([
      target,
      readValue(entry, "pn") || "",
      readValue(entry, "tn") || "",
      Number(readValue(entry, "pt")) || 0,
      Number(readValue(entry, "x")) || 0,
      Number(readValue(entry, "y")) || 0,
    ]);
  }
  if (portals.length) record.p = portals;

  // 刷怪點按怪物聚合；mobTime 取這張圖對該怪的最小值（0 代表用預設回生）
  const mobs = new Map();
  const npcs = new Set();
  for (const entry of splitEntries(sliceBlock(xml, "life"))) {
    const type = readValue(entry, "type");
    const rawId = readValue(entry, "id");
    if (!rawId) continue;
    const id = Number(rawId);
    if (!Number.isFinite(id)) continue;
    if (type === "n") {
      npcs.add(id);
      continue;
    }
    if (type !== "m") continue;
    if (readValue(entry, "hide") === "1") continue;
    const mobTime = Number(readValue(entry, "mobTime")) || 0;
    const current = mobs.get(id) || { count: 0, mobTime: null };
    current.count += 1;
    current.mobTime = current.mobTime === null ? mobTime : Math.min(current.mobTime, mobTime);
    mobs.set(id, current);
  }
  if (mobs.size) record.m = [...mobs.entries()].map(([id, v]) => [id, v.count, v.mobTime]);
  if (npcs.size) record.n = [...npcs];

  return record;
}

/**
 * 世界地圖：每個大陸／區域一張，上面的每個點對應一組地圖 id。
 * 這是「這張圖屬於哪個大陸、在世界地圖的哪個位置」的權威來源，
 * 也是跨大陸導航時「你要先去哪個區域」的依據。
 */
function parseWorldMaps() {
  if (!fs.existsSync(WORLDMAP_DIR)) return [];
  const regions = [];
  for (const file of fs.readdirSync(WORLDMAP_DIR)) {
    if (!file.endsWith(".img.xml")) continue;
    const key = file.replace(".img.xml", "");
    const xml = fs.readFileSync(path.join(WORLDMAP_DIR, file), "utf8");
    const info = sliceBlock(xml, "info");
    const spots = [];
    for (const entry of splitEntries(sliceBlock(xml, "MapList"))) {
      const mapNo = sliceBlock(entry, "mapNo");
      const maps = [...mapNo.matchAll(/value="(\d+)"/g)].map(match => Number(match[1]));
      if (!maps.length) continue;
      const spotMatch = entry.match(/<vector name="spot" x="(-?\d+)" y="(-?\d+)"/);
      spots.push({
        maps,
        title: readValue(entry, "title") || undefined,
        desc: readValue(entry, "desc") || undefined,
        x: spotMatch ? Number(spotMatch[1]) : undefined,
        y: spotMatch ? Number(spotMatch[2]) : undefined,
        type: Number(readValue(entry, "type")) || 0,
      });
    }
    if (!spots.length) continue;
    regions.push({ key, parent: readValue(info, "parentMap") || undefined, spots });
  }
  return regions;
}

/** String.wz/Map.img 給每張圖的英文名與所屬街道，用來補 Artale 沒命名的地圖。 */
function parseStringMap(xml) {
  const names = {};
  const pattern = /<imgdir name="(\d+)">([\s\S]*?)<\/imgdir>/g;
  let match;
  while ((match = pattern.exec(xml))) {
    const id = Number(match[1]);
    const chunk = match[2];
    const mapName = readValue(chunk, "mapName");
    const streetName = readValue(chunk, "streetName");
    if (!mapName && !streetName) continue;
    names[id] = [mapName || "", streetName || ""];
  }
  return names;
}

main();
