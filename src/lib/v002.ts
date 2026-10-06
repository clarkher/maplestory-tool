/**
 * 查資料頁（技能／怪物／任務／道具）判斷「這筆只有 V002 才有」用的純函式。
 * 跟 src/lib/release.ts 分工：release.ts 管「現在算不算還沒開放」（時間），
 * 這裡管「這筆資料本身是不是 V002 內容」（跟時間無關，純粹看資料）。
 * 畫面上要不要顯示「10/15 開放」標示＝這裡的判斷結果 && useBeforeV002()。
 */
import { jobTier } from "./jobs";
import type { Item, MapRecord, Monster, Quest, Skill } from "./types";

/** 地圖是不是 V002 才開放：maps.json 有開放日欄位（o）就是。 */
export function isV002Map(map: MapRecord | undefined): boolean {
  return !!map?.o;
}

/** 技能是不是 V002（三轉）技能。 */
export function isV002Skill(skill: Pick<Skill, "adv">): boolean {
  return skill.adv === "三轉";
}

/** 怪物是不是 V002 才有：要有出沒地圖，而且每一張出沒地圖都是 V002 地圖。 */
export function isV002Monster(monster: Pick<Monster, "maps">, maps: Record<string, MapRecord>): boolean {
  return monster.maps.length > 0 && monster.maps.every(id => isV002Map(maps[String(id)]));
}

/**
 * 任務是不是 V002 才有，三個條件任一成立就算：
 * 1. 等級限制超過 Lv.100
 * 2. 接取 NPC 站的地圖是 V002 地圖
 * 3. 可接的職業都是三轉代碼（混了二轉以下就不算）
 */
export function isV002Quest(quest: Pick<Quest, "minLv" | "sNpc" | "jobs">, maps: Record<string, MapRecord>): boolean {
  if ((quest.minLv ?? 0) > 100) return true;
  if (quest.sNpc?.map != null && isV002Map(maps[String(quest.sNpc.map)])) return true;
  if (quest.jobs && quest.jobs.length > 0 && quest.jobs.every(job => jobTier(job) === 3)) return true;
  return false;
}

/** 整批算一次 V002 怪物 id，給道具判斷用（逐一呼叫 isV002Monster 太浪費）。 */
export function v002MonsterIds(monsters: Monster[], maps: Record<string, MapRecord>): Set<number> {
  const ids = new Set<number>();
  for (const monster of monsters) if (isV002Monster(monster, maps)) ids.add(monster.id);
  return ids;
}

/** 整批算一次 V002 任務 id，給道具判斷用。 */
export function v002QuestIds(quests: Quest[], maps: Record<string, MapRecord>): Set<string> {
  const ids = new Set<string>();
  for (const quest of quests) if (isV002Quest(quest, maps)) ids.add(quest.id);
  return ids;
}

/**
 * 道具是不是只能從 V002 內容拿到：來源（會掉的怪、會給的任務）至少要有一個，
 * 而且全部都是 V002 來源；有商店賣（sh）代表隨時買得到，不算 V002 限定。
 */
export function isV002Item(
  item: Pick<Item, "dm" | "qr" | "sh">,
  monsterIds: Set<number>,
  questIds: Set<string>,
): boolean {
  if (item.sh != null) return false;
  const dm = item.dm ?? [];
  const qr = item.qr ?? [];
  if (dm.length === 0 && qr.length === 0) return false;
  return dm.every(id => monsterIds.has(id)) && qr.every(id => questIds.has(id));
}
