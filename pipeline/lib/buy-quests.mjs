/**
 * 「拍賣買齊就能交的任務」（/plan/buy，v1.13）：要交的道具全都能交易、不用打怪的任務，
 * 跟這些道具在 NPC 商店的價錢（只列常駐、收楓幣的店）。build.mjs 寫成 public/data/buy-quests.json。
 *
 * 能不能交易看上游的 trade：status 是 unlimited、而且沒有 flags.quest。
 * 上游把任務道具（quest: 1，休咪的錢包、白花…）也標 unlimited，但遊戲裡任務道具不能交易、拍賣買不到。
 * 上游把同名道具併成一筆（紅色藥水 2000000 底下有不能交易的活動版 2001500），每個編號自己的交易狀態在 tradeVariants，
 * 所以查的是任務原本要的那個編號。查不到的當作不能交易（寧可少列）。
 */

import { shopRows } from "./shops.mjs";

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
 * 這家店收的是楓幣、而且不是限時活動店。
 * items.json 的 sp 沒有幣別（lib/shops.mjs 只用 c: 1 標商城樂豆點），活動店收的萬聖節硬幣、活動幣會被當成楓幣：
 * 2026-10 萬聖節活動店（雪原的面具祭典現場，currency 是「萬聖節硬幣」、有 availabilityText）賣礦泉水 10 個 1，
 * 直接抄 sp 會寫成「10 個 1 楓幣」。所以這頁自己從上游原始店家資料挑：幣別是楓幣、沒有限時說明才算。
 * 商城的點數店、限時的楓幣店也一併不列——這頁給玩家照著去買，不要列一家過幾天就關的店。
 */
export function isMesoShop(shop) {
  return shop?.currency === "楓幣" && !shop.availabilityText;
}

/**
 * 這些任務要交的道具裡，NPC 常駐商店有賣的：從上游原始店家（item.sources.shops）挑 isMesoShop，
 * 再交給 shopRows 轉成 items.json sp 同一種列（地區開放、地圖名、舊版資料標記都沿用它的規則）。
 * quests.json 的 needItems 是合併後的編號，跟上游道具表的 id 對得上。
 * @param {string[]} questIds buyQuestIds 的結果
 * @param {Array<object>} quests quests.json 的 list
 * @param {Map<number, object>} rawItemsById 上游 artale.items，key 是 Number(item.id)
 * @param {{ openRegions: string[], mapRecords: Record<string, object> }} shopContext shopRows 的第二個參數
 * @returns {Record<string, Array<object>>} 道具編號 → 店家列
 */
export function buyQuestShops(questIds, quests, rawItemsById, shopContext) {
  const wanted = new Set(questIds);
  const shops = {};
  for (const quest of quests) {
    if (!wanted.has(quest.id)) continue;
    for (const row of quest.needItems || []) {
      const raw = rawItemsById.get(Number(row.id));
      const rows = shopRows((raw?.sources?.shops || []).filter(isMesoShop), shopContext);
      if (rows) shops[row.id] = rows;
    }
  }
  return shops;
}

/**
 * 這些任務完成後學會的技能：技能編號 → 技能名稱。
 * 為什麼要自己帶：流浪煉金術師的新技術（6000）完成不給經驗、不給道具，獎勵是學會神匠之魂；
 * 卡片不寫的話玩家會以為做完什麼都沒有。頁面不載 skills.json（243KB），所以把名字跟著 buy-quests.json 走。
 * skillsById 查不到的編號（別的職業線、站上沒有的技能）略過。
 * @param {string[]} questIds buyQuestIds 的結果
 * @param {Array<object>} quests quests.json 的 list（rewardSkills 是技能編號陣列）
 * @param {Map<number, object>} skillsById skills.json 的 list，key 是技能編號、值有 n（技能名）
 * @returns {Record<string, string>}
 */
export function buyQuestSkills(questIds, quests, skillsById) {
  const wanted = new Set(questIds);
  const names = {};
  for (const quest of quests) {
    if (!wanted.has(quest.id)) continue;
    for (const id of quest.rewardSkills || []) {
      const skill = skillsById.get(Number(id));
      if (skill?.n) names[id] = skill.n;
    }
  }
  return names;
}
