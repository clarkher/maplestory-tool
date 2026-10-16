/**
 * 導覽列的四顆與哪一顆亮（v0.85 起傷害計算機拉出來放「我的路線」旁邊，使用者選名稱「算傷害」——
 * 「傷害計算機」五個字在手機上會把「查資料」擠出畫面）。首頁只在 "/" 亮；1–30 懶人包（/guide）是從首頁的看打法、升級路線點進去的，
 * 麵包屑寫「我的路線 › 1–30 懶人包」，所以也亮「我的路線」（persona 第二輪新 10）。
 * v0.98：楓幣匯率（/price/fx）從查資料的「行情」區進去，/price 開頭也亮「查資料」。
 */
export const NAV = [
  { href: "/", label: "我的路線", match: ["/guide"] },
  // 排在查資料前面：/plan/damage 先亮這顆，其他 /plan 照舊亮查資料
  { href: "/plan/damage", label: "算傷害", match: ["/plan/damage"] },
  { href: "/go", label: "帶我去", match: ["/go"] },
  { href: "/db", label: "查資料", match: ["/db", "/plan", "/price"] },
];

/** 這個網址亮哪一顆（都不是就沒有） */
export function activeNav(pathname: string): string | undefined {
  return NAV.find(item => (item.href === "/" && pathname === "/") || item.match.some(prefix => pathname.startsWith(prefix)))?.label;
}
