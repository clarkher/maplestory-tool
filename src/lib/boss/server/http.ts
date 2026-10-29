// src/lib/boss/server/http.ts
// 野王計時 API 共用的小工具（寫法跟練功測速的 route 一致）

const isJson = (request: Request): boolean => (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() === "application/json";

/** 讀 JSON 內容：不是 application/json、或解析失敗回 ok: false（呼叫的回 400「格式不對」） */
export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  // 只收 application/json：別的網站丟來的簡單請求（text/plain 之類）不用預檢，這裡直接擋掉
  if (!isJson(request)) return { ok: false };
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

export const NO_DB = { ok: false, error: "房間功能還沒開" } as const;
export const BAD = { ok: false, error: "格式不對" } as const;
export const DEAD = { ok: false, error: "房間已失效" } as const;
export const TOO_FAST = { ok: false, error: "送太快了，等一下再記" } as const;
export const DB_ERR = { ok: false, error: "連不上，等一下再試" } as const;
