// 贊助 API 共用：哪個環境、回哪裡、防灌
import type { DonateMethod } from "../../donate";

export function isProduction(): boolean {
  return process.env.APP_ENV === "production";
}

export function originOf(request: Request): string {
  return new URL(request.url).origin;
}

/** 回 /support 並帶 ?status=（303：付款平台 POST 回來也改用 GET 開頁）；v2.24 多帶 &method= 給 GA donate_paid */
export function backToSupport(request: Request, status: string, method?: DonateMethod): Response {
  const query = new URLSearchParams({ status, ...(method ? { method } : {}) });
  return Response.redirect(`${originOf(request)}/support?${query}`, 303);
}

/** application/x-www-form-urlencoded 或 multipart 表單都讀成字串表 */
export async function formFields(request: Request): Promise<Record<string, string> | null> {
  try {
    const form = await request.formData();
    const fields: Record<string, string> = {};
    form.forEach((value, key) => {
      if (typeof value === "string") fields[key] = value;
    });
    return fields;
  } catch {
    return null;
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

/**
 * 防灌（v2.24）：同一個位址 windowMs 內最多 max 次。計數放記憶體——同一台 Worker 內有效、不保證全域，
 * 擋的是狂按產生一堆過期付款單，不是資安邊界。
 */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string, now: number = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) hits.clear(); // 記憶體不無限長
      return true;
    },
  };
}

/** 兩個付款端點共用：一分鐘 5 次 */
export const donateLimiter = createRateLimiter(5, 60_000);
