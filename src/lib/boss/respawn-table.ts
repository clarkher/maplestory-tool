// src/lib/boss/respawn-table.ts
// 野王重生時間的文字（v1.90）：計時器卡片、/plan/boss 第一屏的表、頁面描述、llms.txt 共用一份。
// 不是 "use client"：伺服器頁（表格、metadata、llms.txt）要直接呼叫。數字只來自 data/boss/respawn.json（台服玩家實測），
// 不用客戶端 mobTime。
import respawnJson from "../../../data/boss/respawn.json";
import { BOSSES, type BossDef } from "./types";

/** 實測統計截到哪天（資料檔的 statsUntil，例「9/8」） */
export const RESPAWN_STATS_UNTIL: string = (respawnJson as { statsUntil?: string }).statsUntil ?? "";

const measured = (boss: BossDef) => boss.min !== null && boss.max !== null;

/** 王的重生時間（計時器卡片上那行）：45～60 分／約 45 分／還沒有台服實測 */
export function respawnText(boss: BossDef): string {
  if (boss.min === null || boss.max === null) return "還沒有台服實測";
  return boss.min === boss.max ? `約 ${boss.min} 分` : `${boss.min}～${boss.max} 分`;
}

/** 兩張圖輪流的王：「巫婆森林Ⅰ或Ⅱ」 */
export function mapText(maps: string[]): string {
  if (maps.length < 2) return maps[0] ?? "";
  const [a, b] = maps;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `${a}或${b.slice(i)}`;
}

/** 表格那一格：有實測同卡片；只有幾筆、算不出時間的照實寫筆數；一筆都沒有寫還沒有台服實測 */
export function respawnCell(boss: BossDef): string {
  if (measured(boss)) return respawnText(boss);
  return boss.samples > 0 ? `實測只有 ${boss.samples} 筆` : "還沒有台服實測";
}

export type RespawnRow = { id: number; name: string; map: string; respawn: string; measured: boolean };

/** 每隻王一列，順序跟計時器的王一樣 */
export function respawnRows(): RespawnRow[] {
  return BOSSES.map((boss) => ({ id: boss.id, name: boss.name, map: mapText(boss.maps), respawn: respawnCell(boss), measured: measured(boss) }));
}

/** llms.txt 那一段（v1.90）：/plan/boss 第一屏那張表的文字版，AI 被問「蘑菇王多久重生」時可以直接引用 */
export function respawnLlmsLines(siteUrl: string): string[] {
  return [
    `## 野王重生時間（台服玩家實測${RESPAWN_STATS_UNTIL ? `，統計到 ${RESPAWN_STATS_UNTIL}` : ""}）`,
    "",
    "不是遊戲客戶端檔案裡的數值（客戶端跟伺服器實際不符）。沒寫時間的是實測還不夠、算不出來。",
    `打死野王記一筆、算每個頻道多久重生：${siteUrl}/plan/boss`,
    "",
    ...respawnRows().map((row) => `- ${row.name}（${row.map}）：${row.respawn}`),
    "",
  ];
}

/** 一句話：「蘑菇王、殭屍蘑菇王 45～60 分；紅寶王…約 45 分」。同樣時間的併一起，沒實測的不寫 */
export function respawnSummary(): string {
  const groups = new Map<string, string[]>();
  for (const boss of BOSSES.filter(measured)) {
    const text = respawnText(boss);
    groups.set(text, [...(groups.get(text) ?? []), boss.name]);
  }
  return [...groups].map(([text, names]) => `${names.join("、")}${text.startsWith("約") ? "" : " "}${text}`).join("；");
}
