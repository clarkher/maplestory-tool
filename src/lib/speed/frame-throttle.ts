// src/lib/speed/frame-throttle.ts
/**
 * 「最多一秒收一張」的節流：分享畫面一秒進來好幾張，只有隔夠久的那張要讀，其餘直接丟。
 * 回傳的函式吃現在的毫秒時間，回「這張要不要讀」。第一張一定讀；系統時間被往回調（now 比上次還小）也當隔夠久，
 * 不然時鐘往回調一小時，就會一小時讀不到畫面。
 */
export function createFrameThrottle(intervalMs = 1000): (now: number) => boolean {
  let last: number | null = null;
  return now => {
    if (last !== null && now >= last && now - last < intervalMs) return false;
    last = now;
    return true;
  };
}
