/**
 * 從 maplestory.io 抓 GMS v83 的地圖資料。
 *
 * 為什麼需要這一份：Artale 客戶端匯出的資料只有「這隻怪出現在哪些地圖 id」，
 * 沒有傳送門連線、沒有每張圖的刷怪點數量、也沒有一半地圖的名字。
 * 這三樣分別是導航、練功效率、地圖顯示的必要條件。
 *
 * GMS v83 是凍結版本，抓過就不會變，所以結果直接進版控，之後不用重抓。
 */
import fs from "node:fs";
import path from "node:path";
import { fetchJson, pool, sleep, writeJson, readJson, humanBytes, progress } from "./lib/http.mjs";

const REGION = process.env.MSIO_REGION || "GMS";
const VERSION = process.env.MSIO_VERSION || "83";
const BASE = `https://maplestory.io/api/${REGION}/${VERSION}`;
// maplestory.io 併發開太大會整段限流（實測 12 併發有 1/4 的請求被擋），
// 所以預設保守，寧可慢也不要拿到殘缺資料。
const CONCURRENCY = Number(process.env.MSIO_CONCURRENCY || 4);
const DELAY_MS = Number(process.env.MSIO_DELAY_MS || 120);

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW_DIR = path.join(ROOT, "data", "raw");
const MINIMAP_DIR = path.join(ROOT, "data", "cache", "minimaps");
const OUT_FILE = path.join(RAW_DIR, "msio-maps.json");
const NO_TARGET = 999999999;

async function main() {
  fs.mkdirSync(MINIMAP_DIR, { recursive: true });

  console.log(`[msio] 取得 ${REGION} v${VERSION} 地圖清單…`);
  const list = await fetchJson(`${BASE}/map`);
  const ids = [...new Set(list.map(entry => Number(entry.id)))].sort((a, b) => a - b);
  console.log(`[msio] 共 ${ids.length} 張地圖，並行 ${CONCURRENCY}`);

  // 支援中斷續跑：已經抓過的地圖直接沿用，不重打 API。
  const existing = readJson(OUT_FILE, { maps: {} });
  const done = existing.maps || {};
  const todo = ids.filter(id => !done[String(id)]);
  console.log(`[msio] 已有 ${Object.keys(done).length} 張，待抓 ${todo.length} 張`);

  const tick = progress("[msio] 抓取中", todo.length);
  let failures = 0;
  let saved = 0;
  const errorSamples = [];

  await pool(todo, CONCURRENCY, async id => {
    try {
      const raw = await fetchJson(`${BASE}/map/${id}`);
      if (raw) {
        done[String(id)] = compactMap(id, raw);
        if (raw.miniMap?.canvas) {
          fs.writeFileSync(path.join(MINIMAP_DIR, `${id}.png`), Buffer.from(raw.miniMap.canvas, "base64"));
        }
        saved += 1;
        if (saved % 250 === 0) flush(done, ids.length);
      }
    } catch (error) {
      failures += 1;
      if (errorSamples.length < 8) errorSamples.push(`${id}: ${error.message}`);
    } finally {
      tick();
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
  });

  const size = flush(done, ids.length);
  if (errorSamples.length) console.log("[msio] 錯誤樣本：\n  " + errorSamples.join("\n  "));
  console.log(`[msio] 完成：${Object.keys(done).length} 張地圖，失敗 ${failures} 張，輸出 ${humanBytes(size)}`);
  console.log(`[msio] 小地圖圖檔：${fs.readdirSync(MINIMAP_DIR).length} 張於 data/cache/minimaps`);
  if (failures > 0) {
    console.log("[msio] 有失敗的地圖，重跑一次本指令即可續抓（已抓過的會跳過）。");
  }
}

function flush(maps, total) {
  return writeJson(OUT_FILE, {
    source: `maplestory.io ${REGION} v${VERSION}`,
    region: REGION,
    version: VERSION,
    totalMapsOnVersion: total,
    fetchedAt: new Date().toISOString(),
    maps,
  });
}

function compactMap(id, raw) {
  // 刷怪點按怪物 id 聚合。同一張圖同一隻怪會有多個生成點，
  // 點數 × mobRate 就是這張圖實際能同時掛多少隻，這是練功效率的基礎。
  const spawnCounts = new Map();
  for (const mob of raw.mobs || []) {
    if (!mob || mob.hidden) continue;
    const mobId = Number(mob.id);
    if (!Number.isFinite(mobId)) continue;
    spawnCounts.set(mobId, (spawnCounts.get(mobId) || 0) + 1);
  }

  const portals = [];
  for (const portal of raw.portals || []) {
    // 部分地圖的 portals 陣列會夾帶 null（原始 wz 的空槽），不擋會整張圖抓失敗
    if (!portal) continue;
    const toMap = Number(portal.toMap);
    if (!Number.isFinite(toMap) || toMap === NO_TARGET || toMap === id) continue;
    portals.push({
      n: portal.portalName || "",
      tn: portal.toName || "",
      to: toMap,
      t: Number(portal.type) || 0,
      x: Math.round(Number(portal.x) || 0),
      y: Math.round(Number(portal.y) || 0),
    });
  }

  const npcs = [...new Set((raw.npcs || []).filter(Boolean).map(npc => Number(npc.id)).filter(Number.isFinite))];

  const record = {
    name: raw.name || "",
    street: raw.streetName || "",
    town: Boolean(raw.isTown),
    swim: Boolean(raw.isSwim) || undefined,
    ret: Number.isFinite(Number(raw.returnMap)) && Number(raw.returnMap) !== NO_TARGET
      ? Number(raw.returnMap)
      : undefined,
    retName: raw.returnMapName || undefined,
    mark: raw.mapMark || undefined,
    rate: raw.mobRate ? Number(raw.mobRate.toFixed(4)) : undefined,
    mobs: [...spawnCounts.entries()].map(([mobId, count]) => [mobId, count]),
    portals,
    npcs: npcs.length ? npcs : undefined,
  };

  if (raw.miniMap) {
    record.mm = {
      w: raw.miniMap.width,
      h: raw.miniMap.height,
      cx: raw.miniMap.centerX,
      cy: raw.miniMap.centerY,
      mag: raw.miniMap.magnification,
    };
  }

  // 拿掉 undefined，讓 JSON 小一點。
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

main().catch(error => {
  console.error("[msio] 失敗：", error);
  process.exit(1);
});
