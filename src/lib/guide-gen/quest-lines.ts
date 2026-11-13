/**
 * 系列任務文章的表格（v2.26，docs/superpowers/specs/2026-11-13-article-batch-quests-builds-design.md）。
 * 用前置任務（pre）把一般任務串成系列：5 個以上，或有人搜的（QUEST_LINE_EXTRA）才收。
 * 主線：最長那條路，加上終點要先做的任務（兩個起點都要做的系列，兩個都進主線）；沒走到的變分支（做完 X 之後也可以接），
 * 跟主線沒有前置關係的另一個起點也是分支（after 不填）。轉職那串（推薦職業、X轉職、X之路）不算。
 * 每個任務的寫法跟任務單獨頁「一步一步怎麼解」同一套（quest-steps.ts），不另外手寫。
 */
import { questSteps, type QuestStepContext, type StepSeg } from "../quest-steps";
import type { Quest } from "../types";

export type QuestLineBranch = { after?: string; quests: Quest[] };
export type QuestLine = { id: string; name: string; quests: Quest[]; branches: QuestLineBranch[]; minLv: number | null; maxLv: number | null; totalExp: number };

/** 不到 5 個任務但 Search Console 有人搜的系列：放系列裡任一個任務的 id */
export const QUEST_LINE_EXTRA = ["2011", "2015", "2001"];

/** 系列名：搜尋字對得到的用搜尋字（鍵是系列裡任一個任務 id），其他用第一個任務名 */
const QUEST_LINE_NAME: Record<string, string> = {
  "3059": "波達",
  "2011": "珍的挑戰",
  "2015": "阿勒斯與長老斯坦",
  "2001": "酋長蓋房子",
  "3044": "艾斯達的甜蜜果漿",
  "2090": "好無聊",
};

const MIN_SIZE = 5;
const EXCLUDED_CATS = new Set(["活動", "組隊任務", "稱號", "職業", "其他任務"]);

/** 系列文章只收一般任務 */
export const isLineQuest = (quest: Quest) => !EXCLUDED_CATS.has(quest.cat) && !/萬聖節|冒險家的戒指/.test(quest.n) && !/^推薦職業$|轉職$|之路$/.test(quest.n);

/** 「好無聊1」「尋找女兒 1」「(1)」這類尾巴拿掉 */
const baseName = (name: string) => name.replace(/\s*(\(\d+\)|\d+|[Ⅰ-Ⅻ])$/u, "").trim();

export function questLines(quests: Quest[]): QuestLine[] {
  const pool = quests.filter(isLineQuest);
  const byId = new Map(pool.map(quest => [quest.id, quest]));
  const root = new Map(pool.map(quest => [quest.id, quest.id]));
  const find = (id: string): string => {
    while (root.get(id) !== id) id = root.get(id)!;
    return id;
  };
  for (const quest of pool) for (const pre of quest.pre ?? []) if (byId.has(pre)) root.set(find(quest.id), find(pre));
  const groups = new Map<string, Quest[]>();
  for (const quest of pool) groups.set(find(quest.id), [...(groups.get(find(quest.id)) ?? []), quest]);

  return [...groups.values()]
    .filter(group => group.length >= MIN_SIZE || group.some(quest => QUEST_LINE_EXTRA.includes(quest.id)))
    .map(group => buildLine(group));
}

function buildLine(group: Quest[]): QuestLine {
  const ids = new Set(group.map(quest => quest.id));
  const pres = (quest: Quest) => (quest.pre ?? []).filter(pre => ids.has(pre));
  const children = new Map<string, Quest[]>();
  for (const quest of group) for (const pre of pres(quest)) children.set(pre, [...(children.get(pre) ?? []), quest]);
  // 主線：最長的那條路走到底，再把終點要先做的任務（另一個起點等）都補進來，照前置順序排
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    seen.add(id);
    const d = 1 + Math.max(0, ...(children.get(id) ?? []).filter(child => !seen.has(child.id)).map(child => depthOf(child.id, seen)));
    depth.set(id, d);
    return d;
  };
  const deepest = (list: Quest[]) => [...list].sort((a, b) => depthOf(b.id) - depthOf(a.id) || Number(a.id) - Number(b.id))[0];
  const heads = group.filter(quest => !pres(quest).length);
  let end = deepest(heads.length ? heads : group);
  const onPath = new Set([end.id]);
  for (let next = children.get(end.id); next?.length; next = children.get(end.id)) {
    const child = deepest(next.filter(quest => !onPath.has(quest.id)));
    if (!child) break;
    end = child;
    onPath.add(end.id);
  }
  const mainSet = new Set(onPath);
  const addAncestors = (quest: Quest) => pres(quest).forEach(pre => !mainSet.has(pre) && (mainSet.add(pre), addAncestors(byId.get(pre)!)));
  const byId = new Map(group.map(quest => [quest.id, quest]));
  [...onPath].forEach(id => addAncestors(byId.get(id)!));
  const main = topoOrder(group.filter(quest => mainSet.has(quest.id)), pres);
  const placed = new Set(main.map(quest => quest.id));

  // 剩下的照前置順序排進分支：前置在某個分支就接那個分支；不然照「主線上最後一個前置」分組（同一個 after 合一段）
  const branches: QuestLineBranch[] = [];
  const branchOf = new Map<string, QuestLineBranch>();
  const mainIndex = new Map(main.map((quest, index) => [quest.id, index]));
  for (const quest of topoOrder(group.filter(quest => !placed.has(quest.id)), pres)) {
    const inBranch = pres(quest).map(pre => branchOf.get(pre)).find(Boolean);
    const after = pres(quest).filter(pre => mainIndex.has(pre)).sort((a, b) => mainIndex.get(b)! - mainIndex.get(a)!)[0];
    const branch = inBranch ?? branches.find(entry => entry.after === after && after !== undefined) ?? { after, quests: [] };
    if (!branches.includes(branch)) branches.push(branch);
    branch.quests.push(quest);
    branchOf.set(quest.id, branch);
  }

  const levels = group.map(quest => quest.minLv).filter((lv): lv is number => lv !== undefined);
  const named = group.find(quest => QUEST_LINE_NAME[quest.id]);
  return {
    id: main[0].id,
    name: named ? QUEST_LINE_NAME[named.id] : baseName(main[0].n),
    quests: main,
    branches,
    minLv: levels.length ? Math.min(...levels) : null,
    maxLv: levels.length ? Math.max(...levels) : null,
    totalExp: group.reduce((sum, quest) => sum + (quest.exp ?? 0), 0),
  };
}

/** 照前置順序排（同時能做的照 id）；前置繞圈（資料錯）的照 id 收掉，不卡死 */
export function topoOrder(list: Quest[], pres: (quest: Quest) => string[]): Quest[] {
  const ids = new Set(list.map(quest => quest.id));
  const done = new Set<string>();
  const out: Quest[] = [];
  let rest = [...list].sort((a, b) => Number(a.id) - Number(b.id));
  while (rest.length) {
    const ready = rest.find(quest => pres(quest).every(pre => !ids.has(pre) || done.has(pre))) ?? rest[0];
    out.push(ready);
    done.add(ready.id);
    rest = rest.filter(quest => quest !== ready);
  }
  return out;
}

export const levelText = (quest: Pick<Quest, "minLv">) => (quest.minLv === undefined ? "不限等級" : `${quest.minLv} 等`);

/** StepSeg → Markdown（連結變 [字](網址)） */
const segText = (segs: StepSeg[]) => segs.map(seg => (typeof seg === "string" ? seg : `[${seg.t}](${seg.href})`)).join("");

function questBlock(quest: Quest, index: number, ctx: QuestStepContext): string {
  const steps = questSteps(quest, ctx).map(step => {
    const body = step.lines.map(segText).join(" ");
    return `- **${step.title}**：${body}${step.go ? ` [帶我去](${step.go})` : ""}`;
  });
  return [`### ${index}. [${quest.n}](/db/quests/${quest.id})（${levelText(quest)}）`, "", ...steps].join("\n");
}

export function questLineMarkdown(line: QuestLine, ctx: QuestStepContext): Record<"summary" | "steps", string> {
  const count = line.quests.length + line.branches.reduce((sum, branch) => sum + branch.quests.length, 0);
  const range = line.minLv === null ? "不限等級" : line.minLv === line.maxLv ? `${line.minLv} 等起` : `${line.minLv}～${line.maxLv} 等`;
  const first = line.quests[0];
  const where = first.sNpc ? `，從${first.sNpc.mapName ? `${first.sNpc.mapName}的` : ""}${first.sNpc.n}開始` : "";
  const summary = `**${count} 個任務**｜${range}｜總經驗 ${line.totalExp.toLocaleString("en-US")}${where}。 {{src:game}}`;

  let n = 0;
  const parts = line.quests.map(quest => questBlock(quest, ++n, ctx));
  const nameOf = (id: string) => [...line.quests, ...line.branches.flatMap(branch => branch.quests)].find(quest => quest.id === id)?.n ?? id;
  for (const branch of line.branches) {
    parts.push(branch.after ? `做完「${nameOf(branch.after)}」之後也可以接這${branch.quests.length > 1 ? "幾" : "一"}個：` : `也可以從「${branch.quests[0].n}」開始：`);
    parts.push(...branch.quests.map(quest => questBlock(quest, ++n, ctx)));
  }
  return { summary, steps: ["每個任務去哪接、要做什麼、拿什麼，都照遊戲資料。 {{src:game}}", ...parts].join("\n\n") };
}
