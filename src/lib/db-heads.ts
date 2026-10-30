/**
 * 查資料四頁的標題跟說明：清單（DbBrowser）跟伺服器先畫的讀取畫面（DbFallback）用同一份，
 * 換頁時標題不會跳、搜尋引擎抓到的頁面也有這兩行。
 */
export const DB_HEADS = {
  items: { title: "道具", lead: "裝備數值、道具說明，以及最重要的：這東西誰會掉、哪個任務給。" },
  monsters: { title: "怪物", lead: "每隻怪的數值、屬性抗性、出沒地圖與掉落物。點地圖可以直接算路線過去。" },
  quests: { title: "任務", lead: "每個任務的等級與職業條件、去找誰、要交什麼、完成拿多少。" },
  skills: { title: "技能", lead: "每個技能每一級的實際數值，不用自己算。" },
} as const;
