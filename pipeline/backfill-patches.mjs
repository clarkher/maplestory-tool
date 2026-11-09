/**
 * 回填改版差異：把上游每個遊戲版本（取那一版最後一個 commit）用現在的 build.mjs 重建，相鄰兩版跑 build-patch。
 *
 * 用法：
 *   git clone --filter=blob:none <上游網址> data/cache/upstream-history   （第一次；之後 git -C 那裡 fetch）
 *   node pipeline/backfill-patches.mjs --upstream data/cache/upstream-history [--out public/data/patches]
 *
 * 重建結果放 data/cache/patch-base/<版本>（同一個 commit 重跑直接沿用）。一版約 30 秒。
 * 第一個版本沒得比，不產檔；重建失敗的版本印「跳過 <版本>：<原因>」，跟它相鄰的兩份差異都不產（不拿更舊的版本硬比）。
 * 差異檔的 date 用新那一版第一個 commit 的日期。
 */
import fs from "node:fs";
import path from "node:path";
import { cliOpt, ROOT, runBuildPatch } from "./lib/patch-run.mjs";
import { buildAt, versionTimeline } from "./lib/upstream-history.mjs";

const opt = cliOpt(process.argv.slice(2));
const upstream = opt("upstream");
const out = path.resolve(ROOT, opt("out", "public/data/patches"));
if (!upstream) {
  console.error("用法：node pipeline/backfill-patches.mjs --upstream <git 資料夾> [--out <輸出資料夾>]");
  process.exit(2);
}

const timeline = versionTimeline(upstream);
console.log(`上游版本：${timeline.map(s => `${s.version}（${s.first.date}～${s.last.date}，${s.last.commit.slice(0, 8)}）`).join("、")}`);

const built = new Map(); // version → 資料夾；失敗的不放
for (const seg of timeline) {
  const dir = path.join(ROOT, "data", "cache", "patch-base", seg.version);
  const stamp = path.join(dir, ".commit");
  try {
    if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === seg.last.commit) {
      console.log(`沿用 ${seg.version}（${seg.last.commit.slice(0, 8)}）`);
    } else {
      fs.rmSync(dir, { recursive: true, force: true });
      const t = Date.now();
      buildAt(upstream, seg.last.commit, dir);
      fs.writeFileSync(stamp, `${seg.last.commit}\n`);
      console.log(`重建 ${seg.version}（${seg.last.commit.slice(0, 8)}）${Math.round((Date.now() - t) / 1000)} 秒`);
    }
    built.set(seg.version, dir);
  } catch (error) {
    console.log(`跳過 ${seg.version}：${error.message.split("\n")[0]}`);
  }
}

const results = [];
for (let i = 1; i < timeline.length; i++) {
  const prev = timeline[i - 1];
  const seg = timeline[i];
  if (!built.has(prev.version) || !built.has(seg.version)) {
    console.log(`跳過 ${seg.version}：${built.has(seg.version) ? `前一版 ${prev.version}` : "這一版"}重建失敗`);
    continue;
  }
  const line = runBuildPatch({ prev, seg, oldDir: built.get(prev.version), newDir: built.get(seg.version), out });
  console.log(line);
  results.push(line);
}
console.log(`完成：${results.length} 個版本的差異檔 → ${path.relative(ROOT, out)}`);
