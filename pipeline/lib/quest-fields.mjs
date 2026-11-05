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
 * 獎勵清單裡真的會給的。客戶端把「給」跟「收走」放在同一份清單：
 * action=remove 是完成時收走的；還有 action=give、count 0 的——站上 11 個任務全是要交的那個道具（打手指南交 15 個強大力量結晶），
 * 也是收走，不是獎勵。只有明寫 0 才拿掉，沒寫數量的照舊。
 * @param {Array<{action?: string, count?: number}>} rows 上游的 completeRewards／startRewards items
 */
export function givenRewardRows(rows) {
  return rows.filter(row => row?.action !== "remove" && row?.count !== 0);
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
