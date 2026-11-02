import { CACHE_HEADERS } from "./cache-headers.mjs";

// Cloudflare 建置（scripts/cf/build.mjs 設 CF_STATIC=1）：整站輸出成靜態檔到 out/，API 另由 cf/worker.ts 跑。
// 靜態輸出不吃 redirects／headers：快取規則改寫成 out/_headers；舊 Vercel 網址的 301 只在 Vercel 那邊有意義。
const CF_STATIC = process.env.CF_STATIC === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 型別檢查交給一般的 next build（PR 的「建置」檢查）：Cloudflare 建置時 src/app/api 被搬開，測試檔 import 它會找不到
  ...(CF_STATIC ? { output: "export", typescript: { ignoreBuildErrors: true } } : {}),
  env: {
    // 練功測速的驗收掛勾（window.__speedTestStream）只在非正式機有效：建置時寫死環境名稱進程式。
    // Cloudflare 建置看 APP_ENV（production／preview）；Vercel 一定有 VERCEL_ENV，不靠專案設定有沒有打開
    // 「自動公開系統環境變數」（沒打開的話正式機上是空的，掛勾就會開著）
    NEXT_PUBLIC_VERCEL_ENV: process.env.APP_ENV ?? process.env.VERCEL_ENV ?? "",
  },
  reactStrictMode: true,
  images: { unoptimized: true },
};

if (!CF_STATIC) {
  // v1.28 正式網域改 maplehelper.tw：舊的正式機網址整站 301 過去，搜尋引擎的收錄跟分享出去的連結才接得上。
  // 只認舊正式機這個 host；測試機、分支預覽（*-git-*.vercel.app）照舊不轉
  nextConfig.redirects = async () => [
    {
      source: "/:path*",
      has: [{ type: "host", value: "maplestory-tool-three.vercel.app" }],
      destination: "https://maplehelper.tw/:path*",
      statusCode: 301,
    },
  ];
  nextConfig.headers = async () => CACHE_HEADERS;
}

export default nextConfig;
