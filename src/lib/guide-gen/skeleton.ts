/**
 * 新文章骨架（v2.28，npm run guide:gen -- new <quest-line|quests|skill-build> <任務 id｜地區｜二轉職業代碼>）。
 * 設定區、標題照設計文件的格式；產生區塊留標記（guide:gen 會填）；人寫的段落留 <!-- 寫： --> 註解提醒，註解不上頁面。
 */
import { JOB_SLUGS } from "../job-article";
import { staticGuide, staticQuests } from "../static-data";
import { questLines } from "./quest-lines";
import { REGIONS } from "./region-quests";
import { BUILD_LINES } from "./skill-build";

export type SkeletonKind = "quest-line" | "quests" | "skill-build";

const gen = (key: string) => `<!-- gen:${key} -->\n\n（npm run guide:gen 會填）\n\n<!-- /gen -->`;
const front = (meta: Record<string, string>) => ["---", ...Object.entries(meta).map(([k, v]) => `${k}: ${v}`), "---", ""].join("\n");

export function articleSkeleton(kind: SkeletonKind, key: string, today: string): { slug: string; md: string } {
  const dates = { published: today, updated: today };
  if (kind === "quest-line") {
    const quests = staticQuests();
    const line = questLines(quests).find(entry => entry.id === key || [...entry.quests, ...entry.branches.flatMap(b => b.quests)].some(q => q.id === key));
    if (!line) throw new Error(`找不到任務 ${key} 所在的系列（要 5 個以上或在 QUEST_LINE_EXTRA）`);
    const count = line.quests.length + line.branches.reduce((sum, branch) => sum + branch.quests.length, 0);
    const title = `楓之谷經典版${line.name}系列任務攻略：${count} 個任務怎麼接、去哪打、拿什麼`;
    return {
      slug: `quest-line-${line.id}`,
      md: [
        front({ title, description: "<!-- 寫：一句話講這條任務線給什麼、幾等做 -->", category: "任務", tags: `${line.name}, 系列任務`, ...dates, heroAlt: "<!-- 寫 -->" }),
        `# ${title}`, "", "<!-- 寫：開頭一段（楓之谷經典版的這條任務在講什麼、幾等來做、最值得拿的獎勵） -->", "",
        "> **一分鐘看懂**", "> <!-- 寫：三四點 -->", "", gen("summary"), "", "## 每個任務怎麼解", "", gen("steps"), "", "## 做完接著做什麼", "", "<!-- 寫 -->", "",
      ].join("\n"),
    };
  }
  if (kind === "quests") {
    const region = REGIONS.find(entry => entry.slug === key);
    if (!region) throw new Error(`地區只有 ${REGIONS.map(entry => entry.slug).join("、")}`);
    const order = region.order === "chain" ? "照接的順序排" : "照等級排";
    const title = `楓之谷經典版${region.name}任務總整理：全部任務${order}、哪些必解`;
    return {
      slug: `quests-${region.slug}`,
      md: [
        front({ title, description: "<!-- 寫 -->", category: "任務", tags: `${region.name}, 任務總整理`, ...dates, heroAlt: "<!-- 寫 -->" }),
        `# ${title}`, "", "<!-- 寫：開頭一段 -->", "", "> **一分鐘看懂**", "> <!-- 寫 -->", "", gen("summary"), "", "## 全部任務", "", gen("table"), "",
      ].join("\n"),
    };
  }
  const line = Number(key);
  if (!BUILD_LINES.includes(line)) throw new Error(`職業線只有 ${BUILD_LINES.join("、")}（二轉職業代碼）`);
  const second = staticGuide(line).name;
  const third = staticGuide(line + 1).name;
  const title = `楓之谷經典版${third}配點：${second}一轉到三轉技能怎麼點、能力值怎麼配`;
  return {
    slug: `skill-build-${JOB_SLUGS[line]}`,
    md: [
      front({ title, description: "<!-- 寫 -->", category: "職業攻略", tags: `${staticGuide(line - (line % 100)).name}, ${second}, ${third}, 一轉, 二轉, 三轉, 配點`, ...dates, heroAlt: "<!-- 寫 -->" }),
      `# ${title}`, "", "<!-- 寫：開頭一段，口吻用這條職業線 31～50 那篇的寫手 -->", "", "> **一分鐘看懂**", "> <!-- 寫 -->", "",
      "## 能力值怎麼配", "", "<!-- 寫：照 public/data/guides/<職業>.json 的 stat 摘要，不放人名 -->", "",
      "## 一轉技能怎麼點", "", gen("first"), "", "## 二轉技能怎麼點", "", gen("second"), "", "## 三轉技能怎麼點", "", gen("third"), "",
      "## 其他點法", "", gen("others"), "",
    ].join("\n"),
  };
}
