/**
 * 道具卡「哪裡買得到」的店家清單（items.json 的 sp）。
 *
 * 上游（artale.json 的 item.sources.shops）有三種來源：
 *  - NPC 商店：大多取自 v83 私服資料庫（sourceFile heavenms_db_database.sql），不是台服經典版客戶端，
 *    經典版實際賣什麼、賣多少可能不同——記 o: 1，前端標「參考舊版資料，可能有出入」。
 *  - 上游作者手動補的經典版商店（sourceFile manual：通行證遠端商店、雜貨商店的共鳴石交換券、任務解鎖商店）。
 *  - 商城（cashShop，客戶端的商城資料，價格是樂豆點）。
 *
 * 2026-10-06：NPC 商店 2,720 筆裡 1,891 筆只在「未命名地圖」——玩具城、水世界、神木村這些經典版還沒開放的城鎮，
 * 列出來玩家也去不了。所以只留：
 *  1. 店那張圖有中文名、所在地區已開放（跟 build.mjs 收地圖中文名同一套規則，地區空白照舊放行）→ 寫那張圖的名字；
 *  2. 那張圖沒名字，但它回城的城鎮有名字（天空之城、冰原雪域這種官方補過名字的）→ 寫城鎮名；
 *  3. 沒有地圖的：只認通行證遠端商店，其他查不到在哪的不列。
 * 下架的限時售價（hiddenByDefault）不列；同一家店同一個價錢只留一筆。
 *
 * 2026-10-06 修正：一家店可能同時在好幾張圖開（例如科爾在寵物公園、弓箭手村市集都有賣）。
 * 原本只看 shop.maps[0]，排第一的那張圖沒開放就把整家店丟了，漏列已開放的其他分店。
 * 現在每張圖各自判斷上面三條規則，已開放的每一張都各列一筆。
 *
 * 2026-10-24（v1.15）：上游加了萬聖節活動的行商人（sourceFile halloween2026，雪原的面具祭典現場），
 * 收的是「萬聖節硬幣」，原本只認「點數」是樂豆點、其他一律當楓幣，礦泉水就被寫成「10 個 1 楓幣」。
 * 現在不是楓幣也不是樂豆點的，把幣別名稱記在 u；有限時說明（availabilityText）的記結束時間 e，
 * 前端標「活動限定・到 11/11」、過了結束時間自己藏起來（使用者 10/24 拍板 B）。讀不出結束日的限時店不列。
 */

import { HELD_BACK_MAPS } from "./map-names.mjs";

/** 上游的貨幣：「點數」是商城的樂豆點、「楓幣」（或沒寫）是楓幣，其他是活動貨幣（萬聖節硬幣） */
const CASH_CURRENCY = "點數";
const MESO_CURRENCY = "楓幣";
/** NPC 商店的舊版來源 */
const OLD_SOURCE = "heavenms_db_database.sql";
/** 沒有地圖、但確定經典版有的店 */
const REMOTE_SHOP = "楓之谷通行證遠端商店";

/**
 * @param {Array<object> | undefined} shops 上游 item.sources.shops
 * @param {{ openRegions: string[], mapRecords: Record<string, { zh: string, ret?: number }> }} context
 *   openRegions＝build.mjs 的 RELEASE.mapRegions；mapRecords＝buildMaps 的 records（要有 zh、ret）
 * @returns {Array<{ p: string, n?: string, m?: number, pr: number, k?: number, c?: 1, u?: string, e?: string, o?: 1 }> | undefined}
 */
export function shopRows(shops, { openRegions, mapRecords }) {
  if (!Array.isArray(shops) || !shops.length) return undefined;
  const rows = [];
  const seen = new Set();
  for (const shop of shops) {
    if (!shop || shop.hiddenByDefault) continue;
    const price = Number(shop.price);
    if (!(price > 0)) continue;
    const npc = shop.sourceType === "cashShop" ? "" : String(shop.merchantName || "");
    const count = Number(shop.count) || 1;
    const until = shop.availabilityText ? endTime(shop.availabilityText) : undefined;
    if (until === null) continue;
    for (const where of shopPlaces(shop, openRegions, mapRecords)) {
      const row = {
        p: where.place,
        n: npc && !where.place.includes(npc) ? npc : undefined,
        m: where.mapId,
        pr: price,
        k: count > 1 ? count : undefined,
        c: shop.currency === CASH_CURRENCY ? 1 : undefined,
        u: isEventCurrency(shop.currency) ? String(shop.currency) : undefined,
        e: until,
        o: shop.sourceFile === OLD_SOURCE ? 1 : undefined,
      };
      for (const key of Object.keys(row)) if (row[key] === undefined) delete row[key];
      const key = JSON.stringify(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows.length ? rows : undefined;
}

/** 不是楓幣也不是樂豆點：活動貨幣（萬聖節硬幣） */
function isEventCurrency(currency) {
  return Boolean(currency) && currency !== MESO_CURRENCY && currency !== CASH_CURRENCY;
}

/**
 * 限時說明的結束時間（台灣時間）：「2026/10/15 維護後～2026/11/11 23:59」→ "2026-11-11T23:59+08:00"；
 * 只寫日期的算到那天 23:59。讀不出來回 null。
 */
function endTime(text) {
  const match = String(text).match(/[～~]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hour = "23", minute = "59"] = match;
  const pad = value => value.padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${minute}+08:00`;
}

/**
 * 店在哪：回這家店所有已開放的地點陣列（可能是空陣列——還沒開放、查不到在哪）。
 * 一家店可能同時在好幾張圖開（例如科爾在寵物公園、弓箭手村市集都有賣），每張圖各自判斷：
 *  1. 那張圖有中文名、所在地區已開放 → 那張圖的名字；
 *  2. 沒名字，但回城的城鎮有名字 → 城鎮名；
 *  3. 兩個都不是 → 這張圖跳過，不影響同一家店的其他張圖。
 */
function shopPlaces(shop, openRegions, mapRecords) {
  if (shop.sourceType === "cashShop") return [{ place: "商城" }];
  const maps = shop.maps || [];
  if (!maps.length) return shop.sourceLabel === REMOTE_SHOP ? [{ place: REMOTE_SHOP }] : [];
  const places = [];
  for (const map of maps) {
    const id = Number(map.id);
    // 地區開了、官方還沒開的圖（廢礦後半部）：跟建置的地圖中文名同一份擋住清單
    if (HELD_BACK_MAPS.has(id)) continue;
    if (!map.unnamed && map.name && (!map.regionName || openRegions.includes(map.regionName))) {
      places.push({ place: map.name, mapId: id });
      continue;
    }
    const town = mapRecords[String(id)]?.ret;
    const townName = town === undefined ? "" : mapRecords[String(town)]?.zh;
    if (townName) places.push({ place: townName, mapId: town });
  }
  return places;
}

/**
 * NPC 商店的最高單價。同一個道具在不同店家可能不同價，取最高的當參考。
 *
 * 有些店是整組賣（通行證遠端商店：箭矢 2000 支 1400），要除以組數才是一個的價錢。
 * 上游標成 hiddenByDefault 的是「非本期限時售價」，現在買不到這個價，不算。
 * 活動貨幣（萬聖節硬幣）不是錢，也不算——不然只在活動店賣的超級藥水會算成一個 0.2。
 */
export function shopPrice(shops) {
  if (!Array.isArray(shops) || !shops.length) return undefined;
  const prices = shops
    .filter(shop => !shop?.hiddenByDefault && !isEventCurrency(shop?.currency))
    .map(shop => (Number(shop?.price) || 0) / Math.max(Number(shop?.count) || 1, 1))
    .map(price => Math.round(price * 100) / 100)
    .filter(price => price > 0);
  return prices.length ? Math.max(...prices) : undefined;
}
