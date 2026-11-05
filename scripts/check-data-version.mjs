// 資料檔改了，版本號有沒有跟著改；沒有就 exit 1。PR 的「單元測試」會跑（.github/workflows/test.yml）。
// 用法：node scripts/check-data-version.mjs [基準 commit] [比到哪個 commit]
//   不帶參數比 HEAD^1 跟 HEAD：CI 上的 HEAD 是 PR 的合併 commit，HEAD^1 就是基準分支。
//   本機開 PR 前：node scripts/check-data-version.mjs origin/dev
// 只看內容被改的檔：新增的檔網址沒人載過，沒有舊快取。
import { execFileSync } from "node:child_process";
import { staleDataVersion } from "../pipeline/lib/data-version.mjs";

const [base = "HEAD^1", head = "HEAD"] = process.argv.slice(2);
const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=M", base, head], { encoding: "utf8" }).split("\n").filter(Boolean);
const stale = staleDataVersion(changed);

console.log(`比對 ${base}..${head}：改到 ${changed.length} 個檔，其中資料檔 ${changed.filter(file => file.startsWith("public/data/")).length} 個`);
if (stale.length) {
  console.error(`這些資料檔改了，版本號沒跟著改，來過的人會一直拿到舊資料：\n  ${stale.join("\n  ")}`);
  console.error("把 public/data/meta.json 的 builtAt 改成現在時間一起 commit（攻略檔是 public/data/guides/common.json 的 builtAt）。");
  process.exit(1);
}
console.log("版本號都有跟著改");
