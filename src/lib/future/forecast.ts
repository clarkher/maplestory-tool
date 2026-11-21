/**
 * 未來視（/future）手動維護的部分：下一版的時間與內容推估。官方一有消息就改這支，改完 FORECAST_UPDATED 也要改。
 * 材料數字不在這裡，是遊戲資料自動算的（public/data/future.json）。
 * 規格與數字推導：docs/superpowers/specs/2026-11-06-future-view-design.md
 */

/** 這份預測最後整理的日子 */
export const FORECAST_UPDATED = "2026-11-21";
/** 官方改版發佈會開始（11/21 13:00 台灣時間）。過了這個時間、預測還沒更新就要講 */
export const PARTY_AT = "2026-11-21T13:00:00+08:00";
/** V001 到 V002 隔幾天（7/29→10/15），下一版的估法就靠它 */
export const LAST_GAP_DAYS = 78;

export type Certainty = "官方" | "推估" | "猜測";
export type Source = { label: string; href: string };

/** 現在就能準備的東西（有道具圖；item 是道具編號，測試會驗站上真的有） */
export type PrepItem = {
  item: number;
  name: string;
  /** 要準備多少，沒有固定數量不寫 */
  count?: string;
  use: string;
  how: string;
  /** 這條用途是從哪個版本看來的 */
  basis: "Artale" | "舊版";
  source: Source;
};

export type KeyQuest = { title: string; body: string; source: Source };

export type Station = {
  id: string;
  when: string;
  /** 比「when」更寬的範圍 */
  range?: string;
  title: string;
  certainty: Certainty;
  why: string;
  /** 預估窗的最後一天（台灣時間），過了還沒更新就標「比預估晚」 */
  endsAt?: string;
  prep?: PrepItem[];
  quests?: KeyQuest[];
  /** 這一站要放玩具城製作材料 */
  crafts?: true;
  /** 這一站要放玩家職業的四轉材料 */
  fourthJob?: true;
  sources: Source[];
};

const S = {
  party: { label: "楓潮派對報導", href: "https://www.nownews.com/amp/news/6887817" },
  classicLog: { label: "經典版改版歷史", href: "https://home.gamer.com.tw/artwork.php?sn=6369735" },
  oldLog: { label: "2005～2026 楓之谷年表", href: "https://home.gamer.com.tw/creationDetail.php?sn=5838165" },
  artaleLog: { label: "Artale 年表", href: "https://forum.gamer.com.tw/C.php?bsn=79354&snA=910" },
  lpq: { label: "玩具城 101 組隊攻略", href: "https://maplestw.com/lpq/" },
  lpqBoss: { label: "拉圖斯前置攻略", href: "https://forum.gamer.com.tw/C.php?bsn=79354&snA=1933" },
  zakum: { label: "殘暴炎魔機制", href: "https://forum.gamer.com.tw/C.php?bsn=79354&snA=7931" },
  mine: { label: "殘暴炎魔前置教學", href: "https://forum.gamer.com.tw/C.php?bsn=79354&snA=6761" },
  fourth: { label: "四轉流程與 110 等武器", href: "https://forum.gamer.com.tw/C.php?bsn=79354&snA=9112" },
  leafre: { label: "神木村前半攻略", href: "https://forum.gamer.com.tw/C.php?bsn=79354&snA=8748" },
  clock: { label: "飾品跌價分析", href: "https://forum.gamer.com.tw/C.php?bsn=79354&snA=6356" },
  scroll: { label: "卷軸炒價討論", href: "https://disp.cc/ptt/C_Chat/1eCTLI5i" },
  stage: { label: "11/21 發佈會現場照片", href: "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2447" },
  live: { label: "發佈會直播", href: "https://www.youtube.com/live/k_9xh-mwxgw" },
  teri: { label: "官方公告：泰里送好禮", href: "https://maplestoryclassic.beanfun.com/bulletin?Bid=84287" },
  mobile: { label: "官方公告：手機 Beta 版", href: "https://maplestoryclassic.beanfun.com/bulletin?Bid=84290" },
} satisfies Record<string, Source>;

export const STATIONS: Station[] = [
  {
    id: "party",
    when: "11/21（六）",
    title: "官方改版發佈會：公布 12/17～1/28 的排程",
    certainty: "官方",
    why: "發佈會公布了下面標「官方」的四站，玩具城（路德斯湖）排在這些之後的下一版。同一天開放 Android 手機 Beta 版，弓箭手村、天空之城的泰里送禮到 2027/2/17。日期照發佈會投影片，官網公告出來會再對一次。",
    sources: [S.stage, S.live, S.mobile, S.teri],
  },
  {
    id: "next",
    when: "12/17（四）",
    title: "殘暴炎魔、試煉洞窟、昏暗坑道、幸福村",
    certainty: "官方",
    why: "發佈會投影片寫 12/17：遠征隊打殘暴炎魔（最多 30 人、限時 6 小時），新地區試煉洞窟常態開放，新組隊任務昏暗坑道（困難模式 85～100 等），聖誕活動幸福村。進場條件、前置任務官方還沒講，下面的前置是 Artale 的做法，只能當參考。",
    endsAt: "2026-12-18T23:59:59+08:00",
    prep: [
      { item: 4000082, name: "殭屍的金齒", count: "30 個", use: "Artale 的殘暴炎魔前置最後要交，換 5 顆進場用的火焰之眼；老玩家說買金齒比直接買火焰之眼便宜", how: "打礦山殭屍（廢棄礦坑）", basis: "Artale", source: S.mine },
      { item: 2050004, name: "萬能療傷藥", use: "打殘暴炎魔時解虛弱、技能封鎖、黑暗", how: "打蝴蝶精、黑格里芬", basis: "Artale", source: S.zakum },
    ],
    quests: [
      { title: "殘暴炎魔前置任務", body: "Artale 有三段：廢棄礦坑打滿 7 把鑰匙、找到火石母礦，再跳過岩漿關，最後交 30 個殭屍的金齒換 5 顆火焰之眼。身上有火焰之眼才進得了祭壇。台服會不會一樣，要等開放。", source: S.mine },
      { title: "昏暗坑道（新組隊任務）", body: "發佈會講了五階段：破壞箱子集包裹拿零件開門、照需求收集不同顏色的燃油、照順序開信號燈引導礦車、解除鎖定裝置擋怪，最後打吞噬火光的魔物。困難模式 85～100 等，收集 10 個道具換新披風。", source: S.stage },
    ],
    sources: [S.stage, S.live],
  },
  {
    id: "newyear",
    when: "12/31（四）",
    title: "跨年活動：牧羊場的迎新年",
    certainty: "官方",
    why: "發佈會投影片寫 12/31，跟羊群一起倒數跨年。玩法、獎勵官方還沒公布。",
    endsAt: "2027-01-01T23:59:59+08:00",
    sources: [S.stage],
  },
  {
    id: "jan",
    when: "1/7（四）",
    title: "冒險家的戒指第二次覺醒、侵蝕地帶調查",
    certainty: "官方",
    why: "侵蝕地帶調查是台服原創的成長玩法：最多 3 人組隊打被侵蝕的怪，獎勵經驗，每日任務跟硬幣商店也會增加。六個地區各有入場等級：墮落城市 25～40、勇士之村 35～55、天空之城 50～70、奇幻村 65～85、冰原雪域 80～105、廢棄礦坑 100～150。戒指第二次覺醒的內容還沒公布。",
    endsAt: "2027-01-08T23:59:59+08:00",
    sources: [S.stage],
  },
  {
    id: "lantern",
    when: "1/28（四）",
    title: "春節活動：福氣滿滿紅燈籠祭",
    certainty: "官方",
    why: "發佈會投影片寫 1/28。玩法、獎勵官方還沒公布。",
    endsAt: "2027-01-29T23:59:59+08:00",
    sources: [S.stage],
  },
  {
    id: "ludi",
    when: "1/28 之後",
    range: "日期還沒公布",
    title: "下一版：玩具城（路德斯湖）",
    certainty: "官方",
    why: "發佈會時間表最後一格寫「NEXT PATCH」，畫的是路德斯湖（玩具城）跟時間通道，所以玩具城確定是下一版，只是沒給日期。同一張表寫等級上限會擴充，數字被台上的人擋住，等官方公告。",
    crafts: true,
    quests: [
      { title: "玩具城 101 組隊任務", body: "Artale 是 35～50 等、4～6 人，在愛奧斯塔 101 樓。查到的攻略沒列事前要準備的道具。", source: S.lpq },
      { title: "拉圖斯前置任務", body: "Artale 要 80 等以上，交 300 個超光速粒子、100 個神秘粉末，再集裂縫碎片換入場券。這些都是玩具城的怪掉的，現在拿不到，不用先準備。", source: S.lpqBoss },
    ],
    sources: [S.stage],
  },
  {
    id: "far",
    when: "玩具城之後",
    title: "四轉、神木村、地球防衛總部",
    certainty: "猜測",
    why: "發佈會沒提四轉。Artale 從上線到四轉，繁中版 273 天、韓版 303 天；台服玩具城排在 1/28 之後，四轉最快也是那之後。2005 年台服地球防衛總部也排在玩具城後面。120 等上限開放 8 天就有人到頂，所以會是玩家等最久的一版。",
    fourthJob: true,
    prep: [
      { item: 4031348, name: "買秘咒的錢", count: "1,000 萬楓幣", use: "Artale 可以到玩具城愛奧斯塔 44 樓買秘咒，走四轉捷徑，不用自己打噴火龍、格瑞芬多", how: "練功、賣道具", basis: "Artale", source: S.fourth },
      { item: 4005000, name: "力量水晶", use: "110 等龍武器大多一把 8 顆（劍、斧、錘、矛、槍）", how: "冰原雪域合成（力量母礦打石球、利堤）", basis: "Artale", source: S.fourth },
      { item: 4005002, name: "敏捷水晶", use: "聖龍金槍 8 顆、龍形之弓 5 顆、飛龍弩 3 顆", how: "冰原雪域合成", basis: "Artale", source: S.fourth },
      { item: 4005001, name: "智慧水晶", use: "聖龍短杖、龍骨長杖各 6 顆", how: "冰原雪域合成", basis: "Artale", source: S.fourth },
      { item: 4005003, name: "幸運水晶", use: "綠色龍牙拳刃 6 顆、烈風短刃 5 顆", how: "冰原雪域合成", basis: "Artale", source: S.fourth },
    ],
    quests: [
      { title: "四轉流程", body: "Artale 是 120 等到神木村找四轉教官，交英雄之星、英雄的五角冰晶：自己打噴火龍、格瑞芬多，或買秘咒跟村長換。技能點要先點完。", source: S.fourth },
    ],
    sources: [S.artaleLog, S.classicLog, S.oldLog],
  },
];

/** 囤了可能白囤的情況，都是別的版本發生過的事 */
export const RISKS: Array<{ title: string; body: string; source: Source }> = [
  { title: "價格會跌", body: "Artale 的發條鐘約兩個月跌到只剩兩成多。貴的東西不一定撐得住。", source: S.clock },
  { title: "官方可能先鎖住", body: "繁中 Artale 開神木村前半時先把王鎖起來，110 等武器做不出來。玩家猜是怕有人先刷起來屯著。", source: S.leafre },
  { title: "開放前的高價可能是炒的", body: "Artale 的褲裙敏捷卷軸 100% 一夜從 50～60 萬變 90 萬，疑似工作室哄抬。看到突然變貴先別追。", source: S.scroll },
];

/** 「怎麼算的」那張表：開服後多久開 */
export const COMPARE: Array<{ what: string; old: string; artale: string; here: string }> = [
  { what: "冰原雪域", old: "2 個月", artale: "韓版 16 天", here: "已開（78 天）" },
  { what: "三轉", old: "7 個月", artale: "韓版 67 天", here: "已開（78 天）" },
  { what: "玩具城", old: "4 個月", artale: "韓版 20 天", here: "1/28 之後（183 天以上，官方說下一版）" },
  { what: "殘暴炎魔", old: "8 個月", artale: "繁中 98 天", here: "12/17（141 天，官方）" },
  { what: "四轉", old: "25 個月", artale: "繁中 273 天", here: "約 270～330 天" },
];

export const COMPARE_SOURCES: Source[] = [S.oldLog, S.artaleLog, S.classicLog];

/** 四轉職業的名字（畫面用）；代碼跟 public/data/future.json 的 fourthJob 一樣 */
export const FOURTH_JOBS: Array<[number, string]> = [
  [112, "英雄"], [122, "聖騎士"], [132, "黑騎士"],
  [212, "火毒大魔導士"], [222, "冰雷大魔導士"], [232, "主教"],
  [312, "箭神"], [322, "神射手"],
  [412, "夜使者"], [422, "暗影神偷"],
  [512, "拳霸"], [522, "槍神"],
];

/** 玩家現在的職業接到哪個四轉；二轉、三轉才決定得了，其他回 null 讓玩家自己選 */
export function fourthJobOf(job: number): number | null {
  if (job < 100 || job >= 1000 || job % 100 === 0) return null;
  const fourth = job % 10 === 2 ? job : job - (job % 10) + 2;
  return FOURTH_JOBS.some(([id]) => id === fourth) ? fourth : null;
}

/** 頁頂要不要講「這頁過時了」：發佈會過了還沒更新（整理日早於發佈會那天），就不留看起來還對的舊日期 */
export function staleNotice(now: number, updated = FORECAST_UPDATED): string | null {
  if (now >= Date.parse(PARTY_AT) && updated < PARTY_AT.slice(0, 10)) {
    return "11/21 發佈會已經開始，下面還是發佈會前的推估，內容更新中。";
  }
  return null;
}

/** 這一站的預估窗過了還沒開：標出來，不要讓人以為還沒到 */
export function isLate(station: Station, now: number): boolean {
  return Boolean(station.endsAt) && now > Date.parse(station.endsAt as string);
}
