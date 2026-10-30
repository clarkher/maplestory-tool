/**
 * 站上的固定頁面：sitemap.xml 跟 llms.txt（給 AI 讀的網站說明）共用這一份。
 * 新增頁面要加在這裡，兩邊才會一起有。
 */
export type SitePage = { path: string; name: string; what: string; priority: number };

export const SITE_PAGES: SitePage[] = [
  { path: "/", name: "我的路線", what: "選職業、填等級，告訴你現在去哪練、先解哪些任務、技能點哪個", priority: 1 },
  { path: "/plan/train", name: "打怪練功", what: "照等級排出練功地圖：刷怪點、回生秒數、一輪經驗、命中需求", priority: 0.9 },
  { path: "/plan/quest", name: "解任務", what: "這個等級、職業現在接得到的任務", priority: 0.9 },
  { path: "/plan/farm", name: "刷寶物", what: "勾想要的道具，排出一趟收最多樣的地圖", priority: 0.9 },
  { path: "/plan/bundle", name: "任務打包", what: "要跑同一張圖的任務併成一趟，數量加總", priority: 0.9 },
  { path: "/plan/buy", name: "拍賣買齊就能交的任務", what: "不用打怪、買齊東西直接交的任務", priority: 0.8 },
  { path: "/plan/damage", name: "傷害計算機", what: "算技能每一下多少、打怪幾下打死，兩套點法並排比", priority: 0.8 },
  { path: "/plan/boss", name: "野王計時", what: "打死野王按一下，算每個頻道還要多久重生", priority: 0.7 },
  { path: "/plan/speed", name: "練功測速", what: "分享遊戲畫面，自動算 10 分鐘拿多少經驗", priority: 0.7 },
  { path: "/price/fx", name: "楓幣匯率", what: "雪吉拉 1 億楓幣值多少台幣、每天走勢", priority: 0.7 },
  { path: "/event/halloween", name: "萬聖節任務攻略", what: "雪原的面具祭典 1～3 章照順序、要打的怪去哪打", priority: 0.7 },
  { path: "/guide", name: "1–30 懶人包", what: "新手任務 → 轉職 → 月妙 → 超綠，五大職業轉職與配點", priority: 0.9 },
  { path: "/go", name: "帶我去", what: "輸入目的地，一段一段告訴你走哪個傳送門", priority: 0.8 },
  { path: "/db", name: "查資料", what: "怪物、道具、任務、技能資料查詢", priority: 0.8 },
  { path: "/db/monsters", name: "怪物資料", what: "數值、屬性抗性、出沒地圖、掉落物", priority: 0.7 },
  { path: "/db/items", name: "道具資料", what: "裝備數值、誰會掉、哪個任務給", priority: 0.7 },
  { path: "/db/quests", name: "任務資料", what: "等級與職業條件、找誰、交什麼、拿多少", priority: 0.7 },
  { path: "/db/skills", name: "技能資料", what: "每個技能每一級的數值", priority: 0.7 },
  { path: "/about", name: "資料從哪來", what: "資料來源、更新方式與限制", priority: 0.5 },
  { path: "/contact", name: "聯絡我們", what: "回報錯誤、建議", priority: 0.3 },
  { path: "/privacy", name: "隱私權政策", what: "", priority: 0.2 },
  { path: "/terms", name: "服務條款", what: "", priority: 0.2 },
];
