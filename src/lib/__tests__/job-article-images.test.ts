/**
 * 攻略文的圖都到位了嗎（Google Discover 要大圖，v1.49）：掃 src/data/job-articles/ 全部真檔跟 images.gen.json。
 * 每篇的主圖、寫手小頭像、每個非備案步驟的圖都要在清單裡，清單列的檔案要真的在 public/，主圖寬至少 1200、比例 16:9；
 * 清單寫的尺寸要跟真檔一樣（og:image 的寬高、<img> 的 width、height 都讀清單），檔案大小不超過上限。
 * 判斷在 src/lib/job-article.ts 的 articleImageProblems（假資料的測試在 job-article.test.ts）。
 * 圖由 npm run article:images 產生（scripts/job-article-images.mjs）。新文章紅了就跑它。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CACHE_HEADERS } from "../../../cache-headers.mjs";
import { articleImageProblems, parseArticleFile, type ArticleImageManifest, type JobArticle } from "@/lib/job-article";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DIR = path.join(ROOT, "src/data/job-articles");

describe("攻略文的圖", () => {
  it("每篇要的圖都在清單裡、檔案都在、主圖符合 Discover 規格", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "images.gen.json"), "utf8")) as ArticleImageManifest;
    const entries = fs.readdirSync(DIR).flatMap(file => {
      const key = parseArticleFile(file);
      return key ? [{ ...key, article: JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as JobArticle }] : [];
    });
    expect(articleImageProblems(entries, manifest, file => fs.existsSync(path.join(ROOT, "public", file)))).toEqual([]);
  });

  it("清單的尺寸跟真檔一樣、大小不超過上限（手動換圖沒更新清單也擋得到）", async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "images.gen.json"), "utf8")) as ArticleImageManifest;
    const problems: string[] = [];
    const check = async (slug: string, file: string, size: { w: number; h: number }, maxKB: number) => {
      const full = path.join(ROOT, "public/assets/guides", slug, file);
      const { width, height } = await sharp(full).metadata();
      if (width !== size.w || height !== size.h) problems.push(`${slug}/${file}：清單 ${size.w}×${size.h}，真檔 ${width}×${height}`);
      const kb = fs.statSync(full).size / 1024;
      if (kb > maxKB) problems.push(`${slug}/${file}：${kb.toFixed(0)}KB，上限 ${maxKB}KB`);
    };
    for (const [slug, entry] of Object.entries(manifest)) {
      if (entry.hero) {
        await check(slug, "hero.jpg", entry.hero, 300);
        await check(slug, "hero.webp", entry.hero, 300);
      }
      if (entry.author) await check(slug, "author.webp", entry.author, 50);
      for (const [map, size] of Object.entries(entry.steps ?? {})) await check(slug, `${map}.webp`, size, 200);
    }
    expect(problems).toEqual([]);
  });

  it("攻略文的圖每次回伺服器確認：檔名固定，一年 immutable 的話換圖使用者看不到", () => {
    // 同一路徑命中多條時後面的蓋前面的（cache-headers.mjs）
    const rule = CACHE_HEADERS.filter(({ source }) => new RegExp(`^${source.replace(":path*", ".*")}$`).test("/assets/guides/priest-31-50/hero.jpg")).at(-1);
    expect(rule?.headers[0].value).toContain("must-revalidate");
    const other = CACHE_HEADERS.filter(({ source }) => new RegExp(`^${source.replace(":path*", ".*")}$`).test("/assets/monster_frames/100100.png")).at(-1);
    expect(other?.headers[0].value).toContain("immutable");
  });
});
