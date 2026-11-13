// 贊助 API 共用：哪個環境、回哪裡（防灌在 cf/worker.ts，v2.25）
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
