// 靜態檔的快取規則。Vercel 上由 next.config.mjs 的 headers() 套用；
// Cloudflare 上是整站靜態輸出，headers() 不會生效，改由 scripts/cf/build.mjs 照這份寫成 out/_headers。
// 同一路徑命中多條時，後面的規則覆蓋前面的——所以通用的長快取放最前面，
// 需要每次確認的入口檔放後面蓋過去。
export const CACHE_HEADERS = [
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
  {
    // 衝卷模擬的小檔（build-gear 寫，可單獨重跑、meta 版本號不會動）：每次回伺服器確認
    source: "/data/scroll-sim.json",
    headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
  },
  {
    // 紙娃娃的小檔（build-gear 寫，可單獨重跑、meta 版本號不會動）：每次回伺服器確認
    source: "/data/avatar.json",
    headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
  },
  {
    // 練功測速的名字樣板（手動重產、不跟 meta 的版本號走）：每次回伺服器確認，重產後才不會拿到舊樣板
    source: "/data/speed-names.json",
    headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
  },
];
