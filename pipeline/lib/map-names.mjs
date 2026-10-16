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
  // 去天空之城的飛船從這裡出發（官方 10/15【內容擴充】：「透過魔法森林碼頭的售票員購買船票，搭乘每15分鐘一班的飛船」）
  101000300: { name: "魔法森林碼頭", source: "https://maplestoryclassic-event.beanfun.com/EventAd/EventAd?eventAdId=20209" },
  200000000: { name: "天空之城", source: "https://maplestoryclassic.beanfun.com/bulletin?Bid=83849" },
  211000000: { name: "冰原雪域", source: "https://maplestoryclassic.beanfun.com/bulletin?Bid=83849" },
};

/**
 * 地區算已開放、但官方還沒開的圖（id → 名字）：建置時不給中文名，跟未開放地區同一套——練功、地圖、只出現在這些圖的怪都不會上站。
 * V002 公告只開「冰原雪域（含廢棄礦坑前半部）」，沒寫前半部到哪（https://maplestoryclassic.beanfun.com/bulletin?Bid=83952）。
 * 2026-10-16 使用者拍板 2B：試煉的洞穴 1～3（含洞穴裡的小洞穴）、火山那段（火山通道、火山的氣息、殘暴炎魔祭壇）先擋，
 * 有實測說進得去再拿掉。
 */
export const HELD_BACK_MAPS = new Map([
  [211042000, "試煉的洞穴1"],
  [211042100, "試煉的洞穴2"],
  [211042101, "洞穴裡的小洞穴"],
  [211042200, "試煉的洞穴3"],
  [211041900, "火山通道"],
  [280020000, "火山的氣息<第1階段>"],
  [280030000, "殘暴炎魔祭壇"],
]);

/**
 * 地圖的中文名：客戶端有名字就一律用客戶端的——改版後玩家實際看到的以它為準，
 * 哪天客戶端補上名字，這張表就自動被換掉，不用回來改程式。
 * 客戶端沒有名字時才查這張補缺表；兩邊都沒有就照舊誠實回傳空字串，不編名字。
 */
export function officialName(id, clientName) {
  if (clientName) return clientName;
  return OFFICIAL_MAP_NAMES[id]?.name ?? "";
}
