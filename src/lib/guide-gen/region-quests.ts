/**
 * 地區任務懶人包的表格（v2.28）：一區一篇，列這區所有一般任務（isGeneralQuest；v2.36 起推薦職業、轉職也列，系列文才拿掉）。
 * 楓之島 52 個有 45 個沒寫接取等級，整篇照接的順序（前置）排；其他兩區照等級每 10 級一段，沒寫等級的放「不限等級」。
 * 必解照攻略研究的必解索引（mustDoIndex，跟首頁升級路線同一份），只標每組的主任務、每段上面列「這段先解」；系列有文章才連過去（lineHref 回 undefined 就只寫名字）。
 */
import type { GuideMustDo, Quest } from "../types";
import { isGeneralQuest, jobLimit, topoOrder, type QuestLine } from "./quest-lines";

export type Region = { slug: string; cat: string; name: string; order: "chain" | "level" };

export const REGIONS: Region[] = [
  { slug: "maple-island", cat: "楓之島", name: "楓之島", order: "chain" },
  { slug: "victoria", cat: "維多利亞島", name: "維多利亞島", order: "level" },
  { slug: "el-nath", cat: "冰原雪域", name: "冰原雪域", order: "level" },
];

const BAND = 10;
const PICK = 5;

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
  /** 給任務的 NPC 站在很多張圖（楓之谷GM）時，這區裡那張的名字；沒有就照任務資料寫的 */
  npcPlace: (npcId: number, cat: string) => string | undefined = () => undefined,
): Record<"summary" | "table", string> {
  const pool = quests.filter(quest => quest.cat === region.cat && isGeneralQuest(quest));
  const lineOf = new Map(lines.flatMap(line => [...line.quests, ...line.branches.flatMap(branch => branch.quests)].map(quest => [quest.id, line] as const)));
  const pres = (quest: Quest) => quest.pre ?? [];
  const isHead = (quest: Quest) => mustDo.get(quest.id)?.q === quest.id;
  /** 「這段先解：A（理由）、B（理由）」：這段的必解主任務照經驗多到少，最多 PICK 個 */
  const pick = (list: Quest[]) => {
    const heads = list.filter(isHead).sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0) || Number(a.id) - Number(b.id)).slice(0, PICK);
    return heads.length ? `這段先解：${heads.map(quest => `[${mustDo.get(quest.id)!.name.replace(/[[\]]/g, "")}](/db/quests/${quest.id})`).join("、")}\n\n` : "";
  };

  const row = (quest: Quest) => {
    const line = lineOf.get(quest.id);
    const href = line && lineHref(line.id);
    const series = line ? (href ? `[${line.name}](${href})` : line.name) : "";
    const place = quest.sNpc ? (npcPlace(quest.sNpc.id, region.cat) ?? quest.sNpc.mapName) : undefined;
    const who = quest.sNpc ? `${quest.sNpc.n}${place ? `（${place}）` : ""}` : "";
    const exp = quest.exp ? quest.exp.toLocaleString("en-US") : "";
    // 只標每組推薦的主任務；同一條系列的其他任務不標（不然 181 個標了 125 個，等於沒篩）
    const must = isHead(quest) ? " **必解**" : "";
    const limit = jobLimit(quest);
    return `| [${quest.n}](/db/quests/${quest.id})${limit ? `（限${limit}）` : ""}${must} | ${quest.minLv === undefined ? "不限" : quest.minLv} | ${who} | ${exp} | ${rewardCell(quest)} | ${series} |`;
  };
  const table = (list: Quest[]) => ["| 任務 | 等級 | 誰給 | 經驗 | 獎勵 | 系列 |", "|---|---|---|---|---|---|", ...list.map(row)].join("\n");

  let body: string;
  if (region.order === "chain") {
    body = `${pick(pool)}${table(topoOrder(pool, pres))}`;
  } else {
    const byBand = new Map<string, Quest[]>();
    const sorted = [...pool].sort((a, b) => (a.minLv ?? 0) - (b.minLv ?? 0) || Number(a.id) - Number(b.id));
    for (const quest of sorted) {
      const key = quest.minLv === undefined ? "不限等級" : `${Math.max(1, Math.floor((quest.minLv - 1) / BAND) * BAND + 1)}～${Math.floor((quest.minLv - 1) / BAND) * BAND + BAND} 等`;
      byBand.set(key, [...(byBand.get(key) ?? []), quest]);
    }
    // 不限等級放最後
    const keys = [...byBand.keys()].sort((a, b) => (a === "不限等級" ? 1 : b === "不限等級" ? -1 : parseInt(a) - parseInt(b)));
    body = keys.map(key => `### ${key}\n\n${pick(byBand.get(key)!)}${table(byBand.get(key)!)}`).join("\n\n");
  }

  const must = pool.filter(isHead).length;
  const exp = pool.reduce((sum, quest) => sum + (quest.exp ?? 0), 0);
  const summary = `**${pool.length} 個任務**｜必解 ${must} 個｜全部做完經驗合計 ${exp.toLocaleString("en-US")}。 {{src:game}}`;
  return { summary, table: body };
}
