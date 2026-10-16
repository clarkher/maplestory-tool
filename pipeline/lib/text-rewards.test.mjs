import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTextRewards, TEXT_REWARDS } from "./text-rewards.mjs";

// 任務 1203 的說明照抄上游 2.0.0（2026-10-15）：說明寫最終獎勵女神手鐲，completeRewards.items 是空的
const artale = () => ({
  quests: [
    {
      id: "1203",
      name: "女神的痕跡",
      texts: [{ key: "0", label: "可接任務", text: "…打倒第三階段的爸爸精靈，救出智慧女神！ - 限定時間：60分 - 參加人數：6人 - 最終獎勵： 女神手鐲 (蒐集女神的羽翼40個後…)" }],
      completeRewards: { items: [] },
    },
  ],
  items: [{ id: 1082232, name: "女神手鐲", sources: { questRewards: [] } }],
});

test("女神的痕跡：說明寫的最終獎勵女神手鐲接成任務獎勵（道具卡「去哪拿」、任務卡的獎勵都看得到）", () => {
  const data = artale();
  assert.deepEqual(applyTextRewards(data), ["1203 女神的痕跡 → 女神手鐲"]);
  assert.deepEqual(data.items[0].sources.questRewards, [{ questId: "1203", questName: "女神的痕跡", count: 1 }]);
  assert.deepEqual(data.quests[0].completeRewards.items, [{ id: 1082232, name: "女神手鐲", count: 1 }]);
});

test("上游哪天自己補上了（獎勵欄已經有），不重複加", () => {
  const data = artale();
  data.quests[0].completeRewards.items.push({ id: 1082232, name: "女神手鐲", count: 1 });
  data.items[0].sources.questRewards.push({ questId: "1203", questName: "女神的痕跡", count: 1 });
  assert.deepEqual(applyTextRewards(data), []);
  assert.equal(data.quests[0].completeRewards.items.length, 1);
  assert.equal(data.items[0].sources.questRewards.length, 1);
});

test("說明不再寫這個道具（上游改了說明）、任務或道具不見了：建置失敗，不默默留著舊的對應", () => {
  const changed = artale();
  changed.quests[0].texts[0].text = "最終獎勵：女神的羽翼";
  assert.throws(() => applyTextRewards(changed), /1203/);
  const noItem = artale();
  noItem.items = [];
  assert.throws(() => applyTextRewards(noItem), /1082232/);
});

test("表裡每一筆都寫明說明裡的那句話", () => {
  for (const entry of TEXT_REWARDS) assert.ok(entry.quest && entry.item && entry.name);
});
