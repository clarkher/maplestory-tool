/**
 * 導覽列的幾顆與哪一顆亮（v0.85 起傷害計算機拉出來放「我的路線」旁邊，使用者選名稱「算傷害」——
 * 「傷害計算機」五個字在手機上會把「查資料」擠出畫面）。首頁只在 "/" 亮。
 * v0.98：楓幣匯率（/price/fx）從查資料的「行情」區進去。v1.03 起電腦版導覽列多一顆「楓幣匯率」，/price 開頭亮它；
 * 手機沒有這顆（同練功測速），在 /price 時導覽列不亮任何一顆。
 * v1.18：手機導覽列放不下，使用者選 A：算傷害只在電腦版，手機從查資料進去。
 * v1.86（使用者 11/09 照推薦）：多一顆「攻略」（/guides 攻略專區），1–30 懶人包、分等級攻略文、職業頁、活動攻略都亮它；
 * 「帶我去」改叫「地圖導航」；野王計時收進查資料（/plan/boss 亮查資料），萬聖節收進攻略專區。
 * 手機四顆：我的路線、攻略、地圖導航、查資料（字數比原本的「野王計時」少，放得下，scripts/verify/nav-fit.mjs 量過）。
 */
type NavItem = { href: string; label: string; match: string[]; desktopOnly?: true };

export const NAV: NavItem[] = [
  { href: "/", label: "我的路線", match: [] },
  // "/guide" 也比得到 /guides 開頭；職業頁跟活動攻略的麵包屑頭都是「攻略」；v1.94 改版紀錄 /updates 同樣歸攻略
  { href: "/guides", label: "攻略", match: ["/guide", "/jobs", "/event", "/updates"] },
  // 排在查資料前面：/plan/damage 先亮這顆，其他 /plan 照舊亮查資料；v1.18 起只在電腦版（手機從查資料進去）
  { href: "/plan/damage", label: "算傷害", match: ["/plan/damage"], desktopOnly: true },
  // v0.95：要分享遊戲畫面，手機用不了，只在電腦寬度出現（SiteHeader 用 desktopOnly 藏）；同樣要排在查資料前面
  { href: "/plan/speed", label: "練功測速", match: ["/plan/speed"], desktopOnly: true },
  // v1.03：楓幣匯率拉出來（使用者選 A：只在電腦版，手機導覽列放不下，照舊從查資料的「行情」區進去）
  { href: "/price/fx", label: "楓幣匯率", match: ["/price"], desktopOnly: true },
  // v1.68：未來視。手機放五顆會把查資料擠出畫面（375 寬量過），同算傷害只在電腦版，手機從首頁卡、查資料進去
  { href: "/future", label: "未來視", match: ["/future"], desktopOnly: true },
  { href: "/go", label: "地圖導航", match: ["/go"] },
  { href: "/db", label: "查資料", match: ["/db", "/plan"] },
];

/** 這個網址亮哪一顆（都不是就沒有） */
export function activeNav(pathname: string): string | undefined {
  return NAV.find(item => (item.href === "/" && pathname === "/") || item.match.some(prefix => pathname.startsWith(prefix)))?.label;
}
