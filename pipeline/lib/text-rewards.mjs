/**
 * 任務說明寫明了獎勵、上游的獎勵欄卻是空的：照說明補成任務獎勵（buildItems／buildQuests 之前跑，直接改 artale）。
 *
 * 組隊任務的最終獎勵是 NPC 給的，客戶端任務資料不列（女神的痕跡 1203 的 completeRewards.items 是空的，
 * 說明寫「最終獎勵： 女神手鐲」）。只收說明原文白紙黑字寫的；建置時檢查說明裡真的有那個道具名，
 * 上游改了說明、任務或道具不見就建置失敗，不默默留著舊的對應。上游自己補上了就不重複加。
 * 2026-10-16 使用者選 7：女神手鐲的「去哪拿」寫女神的痕跡組隊任務最終獎勵。
 */
export const TEXT_REWARDS = [{ quest: "1203", item: 1082232, name: "女神手鐲" }];

/** 回傳這次補上的「任務 → 道具」（給建置印出來） */
export function applyTextRewards(artale, list = TEXT_REWARDS) {
  const applied = [];
  for (const entry of list) {
    const quest = (artale.quests ?? []).find(row => String(row.id) === entry.quest);
    const item = (artale.items ?? []).find(row => Number(row.id) === entry.item);
    if (!quest) throw new Error(`任務說明補獎勵：任務 ${entry.quest} 不在上游資料（lib/text-rewards.mjs）`);
    if (!item) throw new Error(`任務說明補獎勵：道具 ${entry.item} ${entry.name} 不在上游資料（lib/text-rewards.mjs）`);
    const text = (quest.texts ?? []).map(row => row.text ?? "").join("\n");
    if (!text.includes(entry.name)) {
      throw new Error(`任務說明補獎勵：任務 ${entry.quest} ${quest.name} 的說明沒有寫「${entry.name}」了，先確認上游改了什麼再改 lib/text-rewards.mjs`);
    }
    quest.completeRewards ??= {};
    quest.completeRewards.items ??= [];
    item.sources ??= {};
    item.sources.questRewards ??= [];
    const onQuest = quest.completeRewards.items.some(row => Number(row.id) === entry.item);
    const onItem = item.sources.questRewards.some(row => String(row.questId) === entry.quest);
    if (onQuest && onItem) continue;
    if (!onQuest) quest.completeRewards.items.push({ id: entry.item, name: entry.name, count: 1 });
    if (!onItem) item.sources.questRewards.push({ questId: entry.quest, questName: quest.name, count: 1 });
    applied.push(`${entry.quest} ${quest.name} → ${entry.name}`);
  }
  return applied;
}
