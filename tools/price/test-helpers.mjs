import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// 測試共用：等到條件成立才往下（不用固定睡幾百毫秒，慢的機器也不會誤判）。不是測試檔，npm test 不會當測試跑。
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 每 10 毫秒看一次 fn()，成立（回傳真值）就回傳那個值；等超過 timeoutMs 就丟錯 */
export async function waitFor(fn, timeoutMs = 3000, what = "條件") {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`等了 ${timeoutMs} 毫秒，${what}還是沒成立`);
    await sleep(10);
  }
}

/** page/review-patch.js 是瀏覽器用的一般 script（不是模組）；用 vm 跑起來，取出裡面的 reviewPatch */
export function loadReviewPatch() {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, "page", "review-patch.js"), "utf8"), ctx);
  // 結果在 vm 裡建的物件原型不同，deepEqual 會嫌；複製一份到這邊的世界
  return fields => Object.assign({}, ctx.reviewPatch(fields));
}
