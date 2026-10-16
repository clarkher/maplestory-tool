/**
 * 導覽列的五顆（練功測速只在電腦版）與哪一顆亮（v0.85 起傷害計算機拉出來放「我的路線」旁邊，使用者選名稱「算傷害」——
 * 「傷害計算機」五個字在手機上會把「查資料」擠出畫面）。首頁只在 "/" 亮；1–30 懶人包（/guide）是從首頁的看打法、升級路線點進去的，
 * 麵包屑寫「我的路線 › 1–30 懶人包」，所以也亮「我的路線」（persona 第二輪新 10）。
 * v0.98：楓幣匯率（/price/fx）從查資料的「行情」區進去。v1.03 起電腦版導覽列多一顆「楓幣匯率」，/price 開頭亮它；
 * 手機沒有這顆（同練功測速），在 /price 時導覽列不亮任何一顆。
 */
export const NAV: Array<{ href: string; label: string; match: string[]; desktopOnly?: true }> = [
  { href: "/", label: "我的路線", match: ["/guide"] },
  // 排在查資料前面：/plan/damage 先亮這顆，其他 /plan 照舊亮查資料
  { href: "/plan/damage", label: "算傷害", match: ["/plan/damage"] },
  // v0.95：要分享遊戲畫面，手機用不了，只在電腦寬度出現（SiteHeader 用 desktopOnly 藏）；同樣要排在查資料前面
  { href: "/plan/speed", label: "練功測速", match: ["/plan/speed"], desktopOnly: true },
  // v1.03：楓幣匯率拉出來（使用者選 A：只在電腦版，手機導覽列放不下，照舊從查資料的「行情」區進去）
  { href: "/price/fx", label: "楓幣匯率", match: ["/price"], desktopOnly: true },
  { href: "/go", label: "帶我去", match: ["/go"] },
  { href: "/db", label: "查資料", match: ["/db", "/plan"] },
];

/** 這個網址亮哪一顆（都不是就沒有） */
export function activeNav(pathname: string): string | undefined {
  return NAV.find(item => (item.href === "/" && pathname === "/") || item.match.some(prefix => pathname.startsWith(prefix)))?.label;
}
