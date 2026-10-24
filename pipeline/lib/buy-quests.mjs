/**
 * 「拍賣買齊就能交的任務」（/plan/buy，v1.13）：要交的道具全都能交易、不用打怪的任務，
 * 跟這些道具在 NPC 商店的價錢。build.mjs 寫成 public/data/buy-quests.json。
 *
 * 能不能交易看上游的 trade：status 是 unlimited、而且沒有 flags.quest。
 * 上游把任務道具（quest: 1，休咪的錢包、白花…）也標 unlimited，但遊戲裡任務道具不能交易、拍賣買不到。
 * 上游把同名道具併成一筆（紅色藥水 2000000 底下有不能交易的活動版 2001500），每個編號自己的交易狀態在 tradeVariants，
 * 所以查的是任務原本要的那個編號。查不到的當作不能交易（寧可少列）。
 */

/** 每個道具編號（含併進別筆的）的交易狀態 */
export function tradeTable(rawItems) {
  const table = new Map();
  for (const item of rawItems || []) {
    if (item?.trade) table.set(Number(item.id), item.trade);
    for (const variant of item?.tradeVariants || []) table.set(Number(variant.id), variant);
  }
  return table;
}

export function isTradeable(trade) {
  return trade?.status === "unlimited" && !trade.flags?.quest;
}

/**
 * @param {Array<object>} rawQuests 上游 artale.quests
 * @param {Map<number, object>} tradeOf tradeTable 的結果
 * @param {Set<string>} listed 站上有的任務編號（quests.json 的 id，已經濾過開放地區、等級上限、轉職階段）
 * @returns {string[]} 符合的任務編號，照上游順序
 */
export function buyQuestIds(rawQuests, tradeOf, listed) {
  return (rawQuests || [])
    .filter(quest => listed.has(String(quest.id)))
    .filter(quest => {
      const complete = quest.completeRequirements || {};
      const items = complete.items || [];
      if (!items.length || complete.monsters?.length) return false;
      return items.every(row => isTradeable(tradeOf.get(Number(row?.id))));
    })
    .map(quest => String(quest.id));
}

/**
 * 這些任務要交的道具裡，NPC 商店有賣的：items.json 的 sp 去掉商城（c: 1，樂豆點）那幾列。
 * quests.json 的 needItems 是合併後的編號，跟 items.json 對得上。
 * @returns {Record<string, Array<object>>} 道具編號 → 店家列
 */
export function buyQuestShops(questIds, quests, itemsById) {
  const wanted = new Set(questIds);
  const shops = {};
  for (const quest of quests) {
    if (!wanted.has(quest.id)) continue;
    for (const row of quest.needItems || []) {
      const rows = (itemsById.get(row.id)?.sp || []).filter(shop => !shop.c);
      if (rows.length) shops[row.id] = rows;
    }
  }
  return shops;
}
