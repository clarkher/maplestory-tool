/**
 * 攻略文互導索引＋延伸閱讀（v2.19，使用者 11/12 照推薦：頁首等級條＋文末卡片、自動配＋related 可蓋、至少 3 條）。
 * 規格：docs/superpowers/specs/2026-11-12-guide-related-design.md
 * - 等級條：職業攻略文照職業線自動接（jobSeries）
 * - 文末相關：照 RELATED_RULES 的等級範圍＋排序挑（pickRelated）；.md 的 related:、職業文 JSON 的 related 排前面
 * 新的 .md 文章、GUIDE_PAGES 新頁一定要在 RELATED_RULES 登記，不然 guide-related.test.ts 紅。
 */
import type { ArticleEntry } from "./article-entry";
import { cardExcerpt, type GuideCard } from "./guide-catalog";
import { HALLOWEEN } from "./halloween";

/** 文末相關卡固定幾張（測試也照這個擋） */
export const RELATED_MIN = 3;

/** from～to：這篇給幾等的人看；rank 小的排前面；until：活動結束（ISO 時間），過了就不再推 */
export type RelatedRule = { from: number; to: number; rank: number; until?: string };

export const RELATED_RULES: Record<string, RelatedRule> = {
  // 活動：期間內排最前面
  "/guides/maple-leaf-shop": { from: 10, to: 120, rank: 0, until: "2026-12-17T00:00:00+08:00" },
  // v2.18（#329）的新文章；還沒合進來時這行不作用（pickRelated 只挑攻略專區找得到的頁）
  "/guides/maple-leaf-weapon-jobs": { from: 30, to: 70, rank: 0, until: "2026-12-17T00:00:00+08:00" },
  "/event/halloween": { from: 10, to: 120, rank: 0, until: HALLOWEEN.ends },
  // 轉職、新手：照等級最該看的
  "/guide": { from: 1, to: 30, rank: 1 },
  "/guides/third-job": { from: 31, to: 90, rank: 1 },
  "/guide#pq-moon": { from: 10, to: 21, rank: 2 },
  "/guide#pq-kerning": { from: 21, to: 30, rank: 2 },
  "/guides/adventurer-ring": { from: 30, to: 70, rank: 2 },
  // 誰都用得到
  "/guides/medals": { from: 8, to: 120, rank: 3 },
  "/guides/love-symbols": { from: 50, to: 120, rank: 4 },
  // v2.27 系列任務、地區懶人包、職業配點：照接得到的等級
  "/guides/quest-line-3053": { from: 30, to: 45, rank: 3 },
  "/guides/quest-line-2010": { from: 25, to: 50, rank: 3 },
  "/guides/quests-victoria": { from: 8, to: 70, rank: 2 },
  "/guides/skill-build-spearman": { from: 10, to: 120, rank: 4 },
  "/updates": { from: 1, to: 120, rank: 5 },
};

/* ------------------------------------------------------------------ 等級條 */

export type SeriesEntry = ArticleEntry & { jobName: string };
export type SeriesItem = SeriesEntry & { here: boolean };
export type JobSeries = { title: string; items: SeriesItem[]; next?: SeriesEntry };

const rootOf = (job: number) => job - (job % 100);
const branchOf = (job: number) => job - (job % 10);

/**
 * 二轉、三轉文：一轉那篇＋同一條二轉線（含三轉）照等級排，下一段＝下一格。
 * 一轉文（10～30）：自己＋每條二轉線的第一篇；下一步是分岔，沒有下一段大卡。
 */
export function jobSeries(entries: readonly SeriesEntry[], job: number, from: number): JobSeries {
  const root = rootOf(job);
  const byFrom = (a: SeriesEntry, b: SeriesEntry) => a.from - b.from || a.job - b.job;
  const rootEntries = entries.filter(entry => entry.job === root).sort(byFrom);
  const rootName = rootEntries[0]?.jobName ?? "";
  const mark = (list: SeriesEntry[]) => list.map(entry => ({ ...entry, here: entry.job === job && entry.from === from }));
  if (job === root) {
    const branches = [...new Set(entries.filter(entry => entry.job !== root && rootOf(entry.job) === root).map(entry => branchOf(entry.job)))].sort((a, b) => a - b);
    const firsts = branches.map(branch => entries.filter(entry => branchOf(entry.job) === branch).sort(byFrom)[0]);
    return { title: `${rootName}之後走哪條`, items: mark([...rootEntries, ...firsts]) };
  }
  const branch = branchOf(job);
  const line = [...rootEntries, ...entries.filter(entry => entry.job !== root && branchOf(entry.job) === branch).sort(byFrom)];
  const branchName = entries.find(entry => entry.job === branch)?.jobName ?? entries.find(entry => entry.job === job)?.jobName ?? "";
  const items = mark(line);
  const at = items.findIndex(item => item.here);
  return { title: `${branchName}這條線`, items, next: at >= 0 ? line[at + 1] : undefined };
}

/* ------------------------------------------------------------------ 文末相關 */

/**
 * 跟本篇等級範圍重疊、沒過期的，照 rank 排（同 rank 照規則表順序）；override（手動 related）排最前面。
 * 不放自己、不放 exclude（下一段大卡那篇）。override 寫了找不到的頁直接丟錯（建置失敗，不要默默少一張）。
 */
export function pickRelated({ href, from, to, cards, rules = RELATED_RULES, now, override = [], exclude = [] }: {
  href: string; from: number; to: number; cards: readonly GuideCard[]; rules?: Record<string, RelatedRule>; now: number; override?: readonly string[]; exclude?: readonly string[];
}): GuideCard[] {
  const byHref = new Map(cards.map(card => [card.href, card]));
  const skip = new Set([href, ...exclude]);
  const picked: GuideCard[] = [];
  for (const link of override) {
    const card = byHref.get(link);
    if (!card) throw new Error(`${href} 的 related 寫了 ${link}，攻略專區找不到這頁`);
    if (!skip.has(link)) { picked.push(card); skip.add(link); }
  }
  const order = Object.keys(rules);
  const auto = Object.entries(rules)
    .filter(([link, rule]) => !skip.has(link) && byHref.has(link) && rule.from <= to && from <= rule.to && (!rule.until || now < new Date(rule.until).getTime()))
    .sort(([a, x], [b, y]) => x.rank - y.rank || order.indexOf(a) - order.indexOf(b))
    .map(([link]) => byHref.get(link)!);
  return [...picked, ...auto].slice(0, Math.max(RELATED_MIN, picked.length)).map(card => ({ ...card, title: cardExcerpt(card.title) }));
}
