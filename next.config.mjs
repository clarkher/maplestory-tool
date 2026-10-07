// 建置時間寫死進程式，伺服器跟瀏覽器拿到同一個數字：src/lib/release.ts 用它決定靜態頁上要不要先畫
// 「10/15 開放」，hydration 才對得上。用 ??= 讓建置時另外開的工作程序沿用同一個時間。
process.env.BUILD_TIME ??= String(Date.now());

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { BUILD_TIME: process.env.BUILD_TIME },
  reactStrictMode: true,
  images: { unoptimized: true },
  async headers() {
    // 同一路徑命中多條時，後面的規則覆蓋前面的——所以通用的長快取放最前面，
    // 需要每次確認的入口檔放後面蓋過去。
    return [
      {
        // 資料檔的網址帶著版本號，內容不會變，可以放心長快取。
        source: "/data/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // meta 是遊戲資料的版本入口，必須每次回伺服器確認，否則資料更新了使用者也拿不到。
        source: "/data/meta.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        // 攻略的版本入口（每職一檔的攻略用它的建置時間當版本號）
        source: "/data/guides/common.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        // 裝備卡（一半是玩家攻略，研究改了 meta 版本號不會動）：每次回伺服器確認
        source: "/data/gear.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};
export default nextConfig;
