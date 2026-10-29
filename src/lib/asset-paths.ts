/** 遊戲圖檔的網址。伺服器（靜態頁）跟瀏覽器都用；data.ts 是 "use client"，所以放這裡再由它轉出去。 */

export function monsterImage(id: number) {
  return `/assets/monster_frames/${id}.png`;
}

export function itemImage(id: number) {
  return `/assets/items/${id}.png`;
}

export function npcImage(id: number) {
  return `/assets/npcs/${id}.png`;
}

/**
 * 上游圖示是壞的（綠色雜訊）、我們自己放了正確那張的技能（public/skill-icons/，上游同步不會碰）。
 * 向下跳躍 1006 用皇家騎士團版同一個技能 10001006 的圖：初心者技能 1000～1005、1007、1009 兩版的圖檔逐位元組一樣，只有 1006 壞了
 */
const OWN_SKILL_ICONS = new Set([1006]);

export function skillImage(id: number) {
  return OWN_SKILL_ICONS.has(id) ? `/skill-icons/${id}.png` : `/assets/skills/${id}.png`;
}

export function minimapImage(id: number) {
  return `/minimaps/${id}.png`;
}
