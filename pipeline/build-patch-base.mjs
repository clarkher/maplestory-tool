/**
 * 把上游某個 commit 的資料重建到指定資料夾（改版比對用）。
 * 用法：node pipeline/build-patch-base.mjs --upstream <git 資料夾> --commit <sha> --out <資料夾>
 */
import { buildAt } from "./lib/upstream-history.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const upstream = opt("upstream");
const commit = opt("commit");
const out = opt("out");
if (!upstream || !commit || !out) {
  console.error("用法：node pipeline/build-patch-base.mjs --upstream <git 資料夾> --commit <sha> --out <資料夾>");
  process.exit(2);
}
try {
  buildAt(upstream, commit, out);
  console.log(`已重建上游 ${commit.slice(0, 8)} → ${out}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
