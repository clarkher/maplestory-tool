/**
 * 回填（backfill-patches.mjs）跟資料自動更新（refresh-patch.mjs）共用：找版本的頭尾、跑 build-patch.mjs。
 *
 *   sinceDate(now, days)                                  往前推 days 天的 YYYY-MM-DD；days 是 null 回 undefined（不限）
 *   findCurrentAndPrevious(gitDir, version, { ref, now }) 找這一版與前一個不同版號的段落（區間由近到遠逐步放大）
 *   buildPatchArgs({ prev, seg, oldDir, newDir, out })    build-patch.mjs 的參數
 *   runBuildPatch(opts)                                   跑 build-patch.mjs，回傳它印的那一行
 *
 * 差異檔的口徑（兩邊一樣）：base＝前一版最後一個動到 data.js 的 commit、head＝這一版最後一個、
 * date＝這一版第一個 commit 的日期。
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { versionTimeline } from "./upstream-history.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// 為什麼要分段放大、不直接看全部歷史：上游是 blob:none 的 clone，每看一個 commit 的版號都要另外下載那一版的
// data.js（約 7.5 MB），全部歷史一百多個 commit、本機要 3 分鐘以上。上游大約一兩週出一版，
// 先看最近兩週，找不到前一版再放大；最後一格 null＝全部歷史（這一版拉超過一年才會走到）。
// 只要找到了前一版，這一版的第一個 commit 一定也在區間裡（它比前一版最後一個新），所以 date 不會因為區間被截掉而算錯。
export const SINCE_WINDOWS = [14, 30, 60, 120, 240, 480, null];

export function sinceDate(now, days) {
  if (days === null || days === undefined) return undefined;
  return new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
}

/**
 * 回 { seg, prev, since, mismatch? }：
 *  - seg：這一版的段落；prev：前一個不同版號的段落（整個歷史都沒有就是 null）
 *  - mismatch：上游（看到 ref 為止）最新的版號跟 version 不同時是那個版號，seg、prev 都是 null
 */
export function findCurrentAndPrevious(gitDir, version, { ref, now = new Date(), windows = SINCE_WINDOWS } = {}) {
  let last = { seg: null, prev: null, since: undefined };
  for (const days of windows) {
    const since = sinceDate(now, days);
    const timeline = versionTimeline(gitDir, { since, ref });
    const newest = timeline.at(-1);
    if (newest && newest.version !== version) return { seg: null, prev: null, since, mismatch: newest.version };
    if (timeline.length >= 2) return { seg: newest, prev: timeline.at(-2), since };
    last = { seg: newest ?? null, prev: null, since };
  }
  return last;
}

export function buildPatchArgs({ prev, seg, oldDir, newDir, out }) {
  return [
    "--old", oldDir,
    "--new", newDir,
    "--out", out,
    "--version", seg.version,
    "--prev", prev.version,
    "--base", prev.last.commit,
    "--head", seg.last.commit,
    "--date", seg.first.date,
  ];
}

export function runBuildPatch(opts) {
  return execFileSync(process.execPath, [path.join(ROOT, "pipeline", "build-patch.mjs"), ...buildPatchArgs(opts)], { encoding: "utf8" }).trim();
}
