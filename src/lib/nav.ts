/**
 * 導覽列的三顆與哪一顆亮。首頁只在 "/" 亮；1–30 懶人包（/guide）是從首頁的看打法、升級路線點進去的，
 * 麵包屑寫「我的路線 › 1–30 懶人包」，所以也亮「我的路線」（persona 第二輪新 10）。
 */
export const NAV = [
  { href: "/", label: "我的路線", match: ["/guide"] },
  { href: "/go", label: "帶我去", match: ["/go"] },
  { href: "/db", label: "查資料", match: ["/db", "/plan"] },
];

/** 這個網址亮哪一顆（都不是就沒有） */
export function activeNav(pathname: string): string | undefined {
  return NAV.find(item => (item.href === "/" && pathname === "/") || item.match.some(prefix => pathname.startsWith(prefix)))?.label;
}
