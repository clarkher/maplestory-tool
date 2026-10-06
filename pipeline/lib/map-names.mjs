/**
 * 官方公告過、但客戶端匯出還沒有中文名的城鎮補缺表。
 *
 * 客戶端的中文名只跟著玩家實際玩得到的進度出現：V002（天空之城、冰原雪域）開放前，
 * 這兩座城鎮在怪物／任務資料裡全部是「未命名地圖 NNNNNNNN」（unnamed: true）。
 * 地區本身（regionName 冰原雪域）已經在 build.mjs RELEASE.mapRegions 裡、算已開放，
 * 缺的只是這兩座城鎮自己的名字——主推卡因此會寫「從未開放地圖走 N 張圖」、
 * 帶我去的起點也印「未開放地圖」，但路線本身其實是通的（Task 10 量到 1,371／2,381 個組合）。
 *
 * 只收官方白紙黑字公告過的地名（V002 公告 https://maplestoryclassic.beanfun.com/bulletin?Bid=83849），
 * 不用英文 mark（Orbis、ElNath）直接翻、也不用其他版本的中文名回填——那些不是台服經典版官方自己的講法。
 * 之後要加新的一筆，先確認真的有公告，不要用猜的。
 */
export const OFFICIAL_MAP_NAMES = {
  200000000: { name: "天空之城", source: "https://maplestoryclassic.beanfun.com/bulletin?Bid=83849" },
  211000000: { name: "冰原雪域", source: "https://maplestoryclassic.beanfun.com/bulletin?Bid=83849" },
};

/**
 * 地圖的中文名：客戶端有名字就一律用客戶端的——改版後玩家實際看到的以它為準，
 * 哪天客戶端補上名字，這張表就自動被換掉，不用回來改程式。
 * 客戶端沒有名字時才查這張補缺表；兩邊都沒有就照舊誠實回傳空字串，不編名字。
 */
export function officialName(id, clientName) {
  if (clientName) return clientName;
  return OFFICIAL_MAP_NAMES[id]?.name ?? "";
}
