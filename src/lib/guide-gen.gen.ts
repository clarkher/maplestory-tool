/**
 * npm run guide:gen（scripts/guide-gen.mjs）實際跑的地方：要讀 TypeScript 跟路徑別名，所以借 vitest 跑。沒給環境變數就跳過。
 * GUIDE_GEN=all：src/content/guides 裡 quest-line-*、quests-*、skill-build-* 的產生區塊全部照現在資料重產。
 * GUIDE_GEN=new:<kind>:<key>：建新文章骨架（已有同名檔就不蓋），再填產生區塊。
 * 結果（改了哪些檔、缺了哪些區塊）寫到 GUIDE_GEN_OUT。
 */
import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { expectedSections, GEN_PREFIXES } from "./guide-gen/expected";
import { replaceGenSections } from "./guide-gen/sections";
import { articleSkeleton, type SkeletonKind } from "./guide-gen/skeleton";

const mode = process.env.GUIDE_GEN;
const out = process.env.GUIDE_GEN_OUT;
const DIR = path.join(process.cwd(), "src", "content", "guides");

it.runIf(mode && out)("產生攻略文的表格", () => {
  const report: string[] = [];
  if (mode!.startsWith("new:")) {
    const [, kind, key] = mode!.split(":");
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());
    const { slug, md } = articleSkeleton(kind as SkeletonKind, key, today);
    const file = path.join(DIR, `${slug}.md`);
    if (fs.existsSync(file)) report.push(`${slug}.md 已經有了，不蓋（只重產表格）`);
    else {
      fs.writeFileSync(file, md);
      report.push(`新增 ${slug}.md`);
    }
  }
  for (const file of fs.readdirSync(DIR).filter(name => name.endsWith(".md") && GEN_PREFIXES.some(prefix => name.startsWith(prefix)))) {
    const slug = file.slice(0, -3);
    const want = expectedSections(slug);
    if (!want) {
      report.push(`${slug}：對不到系列／地區／職業，跳過`);
      continue;
    }
    const before = fs.readFileSync(path.join(DIR, file), "utf8");
    const { md, missing } = replaceGenSections(before, want);
    if (md !== before) {
      fs.writeFileSync(path.join(DIR, file), md);
      report.push(`重產 ${slug}`);
    }
    if (missing.length) report.push(`${slug}：檔案裡有 ${missing.join("、")} 標記但產生器沒有`);
  }
  fs.writeFileSync(out!, report.join("\n") || "全部都是最新的");
});
