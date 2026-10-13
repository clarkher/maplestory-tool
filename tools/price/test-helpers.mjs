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
