/**
 * 地區任務懶人包的表格（v2.28）：一區一篇，列這區所有一般任務（跟系列文同一個 isLineQuest）。
 * 楓之島 52 個有 45 個沒寫接取等級，整篇照接的順序（前置）排；其他兩區照等級每 10 級一段，沒寫等級的放「不限等級」。
 * 必解照攻略研究的必解索引（mustDoIndex，跟首頁升級路線同一份）；系列有文章才連過去（lineHref 回 undefined 就只寫名字）。
 */
import type { GuideMustDo, Quest } from "../types";
import { isLineQuest, topoOrder, type QuestLine } from "./quest-lines";

export type Region = { slug: string; cat: string; name: string; order: "chain" | "level" };

export const REGIONS: Region[] = [
  { slug: "maple-island", cat: "楓之島", name: "楓之島", order: "chain" },
  { slug: "victoria", cat: "維多利亞島", name: "維多利亞島", order: "level" },
  { slug: "el-nath", cat: "冰原雪域", name: "冰原雪域", order: "level" },
];

const BAND = 10;

/** 獎勵欄：前兩樣道具，多的寫「等 N 樣」 */
function rewardCell(quest: Quest): string {
  const items = quest.rewardItems ?? [];
  if (!items.length) return "";
  const name = (item: (typeof items)[number]) => `${item.n}${item.c && item.c > 1 ? ` ×${item.c}` : ""}`;
  // rand＝一堆裡隨機給一樣，不能寫成「A、B 等 N 樣」讓人以為全部都拿得到
  const fixed = items.filter(item => !item.rand);
  const random = items.filter(item => item.rand);
  const parts: string[] = [];
  if (fixed.length) parts.push(`${fixed.slice(0, 2).map(name).join("、")}${fixed.length > 2 ? ` 等 ${fixed.length} 樣` : ""}`);
  if (random.length) parts.push(random.length === 1 ? name(random[0]) : `隨機一樣（共 ${random.length} 種）`);
  return parts.join("，");
}

export function regionMarkdown(
  region: Region,
  quests: Quest[],
  lines: QuestLine[],
  mustDo: Map<string, GuideMustDo>,
  lineHref: (lineId: string) => string | undefined,
): Record<"summary" | "table", string> {
  const pool = quests.filter(quest => quest.cat === region.cat && isLineQuest(quest));
  const lineOf = new Map(lines.flatMap(line => [...line.quests, ...line.branches.flatMap(branch => branch.quests)].map(quest => [quest.id, line] as const)));
  const pres = (quest: Quest) => quest.pre ?? [];

  const row = (quest: Quest) => {
    const line = lineOf.get(quest.id);
    const href = line && lineHref(line.id);
    const series = line ? (href ? `[${line.name}](${href})` : line.name) : "";
    const who = quest.sNpc ? `${quest.sNpc.n}${quest.sNpc.mapName ? `（${quest.sNpc.mapName}）` : ""}` : "";
    const exp = quest.exp ? quest.exp.toLocaleString("en-US") : "";
    const must = mustDo.has(quest.id) ? " **必解**" : "";
    return `| [${quest.n}](/db/quests/${quest.id})${must} | ${quest.minLv === undefined ? "不限" : quest.minLv} | ${who} | ${exp} | ${rewardCell(quest)} | ${series} |`;
  };
  const table = (list: Quest[]) => ["| 任務 | 等級 | 誰給 | 經驗 | 獎勵 | 系列 |", "|---|---|---|---|---|---|", ...list.map(row)].join("\n");

  let body: string;
  if (region.order === "chain") {
    body = table(topoOrder(pool, pres));
  } else {
    const byBand = new Map<string, Quest[]>();
    const sorted = [...pool].sort((a, b) => (a.minLv ?? 0) - (b.minLv ?? 0) || Number(a.id) - Number(b.id));
    for (const quest of sorted) {
      const key = quest.minLv === undefined ? "不限等級" : `${Math.max(1, Math.floor((quest.minLv - 1) / BAND) * BAND + 1)}～${Math.floor((quest.minLv - 1) / BAND) * BAND + BAND} 等`;
      byBand.set(key, [...(byBand.get(key) ?? []), quest]);
    }
    // 不限等級放最後
    const keys = [...byBand.keys()].sort((a, b) => (a === "不限等級" ? 1 : b === "不限等級" ? -1 : parseInt(a) - parseInt(b)));
    body = keys.map(key => `### ${key}\n\n${table(byBand.get(key)!)}`).join("\n\n");
  }

  const must = pool.filter(quest => mustDo.has(quest.id)).length;
  const exp = pool.reduce((sum, quest) => sum + (quest.exp ?? 0), 0);
  const summary = `**${pool.length} 個任務**｜必解 ${must} 個｜全部做完經驗合計 ${exp.toLocaleString("en-US")}。 {{src:game}}`;
  return { summary, table: body };
}
