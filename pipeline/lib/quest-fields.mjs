/**
 * 任務卡上兩個上游寫不出來的欄位（buildQuests 用）。
 */

/**
 * 接取條件的道具分成「身上要有」跟「身上不能有」。
 * 客戶端接取條件裡 count 沒寫（＝要 0 個）的道具是不能有，上游一律補成 1，站上就寫成「身上要有」——
 * 瑪亞愛情象徵要「身上要有」自己的獎勵、尋找皺摺的紙片要「身上要有」劇情說弄丟的紙片，都是反的。
 * 客戶端沒有的任務（比上游舊）照上游寫。
 * @param {string} questId
 * @param {Array<{id:number,n:string,c?:number}>|undefined} startItems rowRefs 之後的接取道具
 * @param {Record<string, number[]>} none data/client/quest-start-none.json 的 none（scripts/client/quest-start-none.mjs 抽的）
 */
export function splitStartNone(questId, startItems, none) {
  const noneIds = new Set(none[questId] ?? []);
  const keep = [];
  const drop = [];
  for (const row of startItems ?? []) {
    if (noneIds.has(row.id)) drop.push({ id: row.id, n: row.n });
    else keep.push(row);
  }
  return { startItems: keep.length ? keep : undefined, startNone: drop.length ? drop : undefined };
}

/**
 * 前置任務照上游的狀態分三種（startRequirements.quests[].state）：2 已完成、1 進行中、0 未開始。
 * 沒寫（上游標「狀態 None」）跟未開始一樣：客戶端查得到的也是沒寫 state，就是 0。
 * 五條職業之路互斥（互相寫未開始）、幫助拉爾要巨居蟹的祭品進行中，都不能寫成「要先完成」。
 * - pre：要比它先碰到的（已完成＋進行中），排順序、推等級都看這個
 * - preDoing：pre 裡要進行中的，接了、還沒交才接得到
 * - preNot：接過就接不到的。站上沒有的不留：玩家接不到，這個條件一定成立（不明人士的 4 個）
 * @param {Array<{id:number,state?:number}|number>|undefined} entries 上游的 startRequirements.quests
 * @param {Set<string>} listed 站上有的任務編號
 */
export function splitPreQuests(entries, listed) {
  const pre = [];
  const preDoing = [];
  const preNot = [];
  for (const entry of entries ?? []) {
    const id = String(entry?.id ?? entry);
    const state = typeof entry === "object" ? entry.state ?? 0 : 2;
    if (state === 0) {
      if (listed.has(id)) preNot.push(id);
      continue;
    }
    pre.push(id);
    if (state === 1) preDoing.push(id);
  }
  return {
    pre: pre.length ? pre : undefined,
    preDoing: preDoing.length ? preDoing : undefined,
    preNot: preNot.length ? preNot : undefined,
  };
}

/**
 * 獎勵技能的名字。流浪煉金術師的新技術（6000）獎勵三個神匠之魂（冒險家、皇家騎士團、狂狼勇士各一個編號），
 * 經典版只有冒險家，站上（skills.json）也只有 1003——寫「附贈技能 3 個」玩家會以為拿三個。查不到的略過。
 * @param {number[]|undefined} ids quest.rewardSkills
 * @param {Map<number, {n?: string}>} skillsById skills.json 的 list
 */
export function rewardSkillNames(ids, skillsById) {
  const names = (ids ?? []).map(id => skillsById.get(id)?.n).filter(Boolean);
  return names.length ? names : undefined;
}
