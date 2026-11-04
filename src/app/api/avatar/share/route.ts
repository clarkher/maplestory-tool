// src/app/api/avatar/share/route.ts
import { readShare, shareHtml } from "@/lib/avatar/share";

export const dynamic = "force-dynamic";

/**
 * 紙娃娃分享連結：回一小頁帶 og 標籤的 HTML（LINE、Discord 貼連結才有預覽圖），人打開馬上轉去 /plan/avatar。
 * 不讀資料檔、不連資料庫：圖片網址全由進來的數字自己組（見 src/lib/avatar/share.ts）。
 * 缺 s、h、f（畫不出圖）就 302 到 /plan/avatar，有什麼帶什麼。
 */
export async function GET(request: Request): Promise<Response> {
  const { page, image } = readShare(new URL(request.url).searchParams);
  if (image === null) return Response.redirect(new URL(page, request.url), 302);
  return new Response(shareHtml(page, image), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // 同一串穿搭畫出來的頁一樣，瀏覽器、爬蟲留一天；頁面不給搜尋引擎收
      "cache-control": "public, max-age=86400",
      "x-robots-tag": "noindex",
    },
  });
}

/** 有些連結預覽工具先送 HEAD 看一眼；Cloudflare 的 Worker 不會替 GET 補 HEAD（Vercel 會），這裡補上 */
export async function HEAD(request: Request): Promise<Response> {
  const res = await GET(request);
  return new Response(null, { status: res.status, headers: res.headers });
}
