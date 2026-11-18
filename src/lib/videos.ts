/**
 * 影片區（v2.32，使用者 11/16 照推薦）：YouTube 頻道「楓谷幫手」的片，一集一筆（正片＋短影音）。
 * 清單寫在這裡、不打 YouTube（RSS 11/16 實測回 404／500，Data API 要放金鑰）。
 * 排程公開的片可以先寫進來：頁面在瀏覽器照現在時間篩，到了 publishAt 自己出現。
 * 加一集：這裡加一筆＋`node scripts/video-covers.mjs` 產 public/videos/<id>.webp（測試會擋沒封面的）。
 */
export type VideoEpisode = {
  /** 站上的短標題 */
  title: string;
  /** 一句話講這集在講什麼（也給 Google 的影片資料用） */
  summary: string;
  /** 公開時間（ISO，含時區） */
  publishAt: string;
  /** 橫的正片 YouTube id */
  main?: string;
  /** 直的短影音 YouTube id */
  shorts?: string;
  /** 這集在講的站上工具 */
  tool?: { href: string; text: string };
};

export const CHANNEL_URL = "https://www.youtube.com/@maplehelpertw";

export const EPISODES: VideoEpisode[] = [
  {
    title: "楓潮派對 11/21 登場",
    summary: "官方公告快報：2026 楓潮派對 11/21 登場，10/31 13:00 開賣。",
    publishAt: "2026-11-13T08:22:00Z",
    main: "t3HaqEpW0YA",
    shorts: "2uywASG-4V4",
  },
  {
    title: "楓葉武器怎麼衝？",
    summary: "11/19 楓葉商會開跑，每天 100 枚硬幣，換武器還是換卷軸、衝到幾的機會多大。",
    publishAt: "2026-11-15T08:10:00Z",
    main: "x7mKdQOladI",
    shorts: "WsasMyLueLM",
    tool: { href: "/plan/leaf", text: "楓葉衝卷規劃器" },
  },
  {
    title: "我發現一個超好笑的楓之谷工具",
    summary: "紙娃娃隨機穿搭：按一下抽一套，看角色穿起來長怎樣。",
    publishAt: "2026-11-15T11:00:00Z",
    main: "hMkNYNF5Zxw",
    shorts: "V8eXSM4fQLU",
    tool: { href: "/plan/avatar", text: "紙娃娃" },
  },
  {
    title: "螞蟻洞Ⅰ怎麼去？",
    summary: "從弓箭手村出發 5 段、經過 6 張圖，每段走哪個門。",
    publishAt: "2026-11-17T11:00:00Z",
    main: "SiMR8dZljtk",
    shorts: "S-X_7Y6smZE",
    tool: { href: "/go?from=100000000&to=105050000", text: "地圖導航" },
  },
  {
    title: "楓葉商會今天開跑",
    summary: "每天 100 枚硬幣，43 級楓葉武器最快 11/20 換到。",
    publishAt: "2026-11-19T10:00:00Z",
    main: "CNX14Q4RO2Y",
    shorts: "PDEQZXhgWcY",
    tool: { href: "/plan/leaf", text: "楓葉衝卷規劃器" },
  },
  {
    title: "楓潮派對明天登場",
    summary: "11/21 13:00 改版發佈會，票只賣到 11/20 23:59。",
    publishAt: "2026-11-20T11:00:00Z",
    main: "uZh60LCmw44",
    shorts: "cv5GbqNr37w",
    tool: { href: "/updates", text: "改版整理" },
  },
  {
    title: "30 等打火獨眼獸要幾下？",
    summary: "狂戰士、火毒巫師、獵人、刺客 4 職業實算，刺客全幸 10 分鐘經驗多約 21%。",
    publishAt: "2026-11-18T11:00:00.000Z",
    main: "ijH97mpMgwo",
    shorts: "5s9DXu7a8Jc",
    tool: { href: "/plan/damage?job=410&level=30&mob=2230100", text: "算傷害" },
  },
  {
    title: "地鐵二號線[地區02]怎麼去？",
    summary: "從墮落城市出發 5 段、經過 6 張圖，每段走哪個門。",
    publishAt: "2026-11-18T04:00:00.000Z",
    main: "3Gpk23J3xG4",
    shorts: "K6Db5yXQKnQ",
    tool: { href: "/go?to=103000201&from=103000000", text: "地圖導航" },
  },
  {
    title: "綠水靈在哪打？",
    summary: "最多在大木林Ⅱ（53 個刷怪點），一共出現在 54 張圖。",
    publishAt: "2026-11-18T11:00:00.000Z",
    main: "UvP2ze5sBX4",
    shorts: "yGQDEbBgN38",
    tool: { href: "/db/monsters/210100", text: "綠水靈資料" },
  },
  {
    title: "紅寶在哪打？",
    summary: "最多在墮落城市北方工地（24 個刷怪點），一共出現在 42 張圖。",
    publishAt: "2026-11-18T01:00:00.000Z",
    shorts: "Q2RiiOMIC5c",
    tool: { href: "/db/monsters/130101", text: "紅寶資料" },
  },
  {
    title: "地鐵一號線[地區03]怎麼去？",
    summary: "從墮落城市出發 5 段、經過 6 張圖，每段走哪個門。",
    publishAt: "2026-11-18T07:00:00.000Z",
    shorts: "WDB_G2-8Pac",
    tool: { href: "/go?to=103000104&from=103000000", text: "地圖導航" },
  },
  {
    title: "藍寶在哪打？",
    summary: "最多在維多利亞港郊外（25 個刷怪點），一共出現在 40 張圖。",
    publishAt: "2026-11-18T09:00:00.000Z",
    shorts: "_pGQ4qzYxO8",
    tool: { href: "/db/monsters/100101", text: "藍寶資料" },
  },
  {
    title: "森林迷宮V怎麼去？",
    summary: "從奇幻村出發 5 段、經過 6 張圖，每段走哪個門。",
    publishAt: "2026-11-18T13:00:00.000Z",
    shorts: "5ZwaNVsvtCg",
    tool: { href: "/go?to=105040305&from=105040300", text: "地圖導航" },
  },
  {
    title: "地鐵二號線[地區03]怎麼去？",
    summary: "從墮落城市出發 6 段、經過 7 張圖，每段走哪個門。",
    publishAt: "2026-11-19T04:00:00.000Z",
    main: "LpXrzfP2-iw",
    shorts: "VITL4MA86mA",
    tool: { href: "/go?to=103000202&from=103000000", text: "地圖導航" },
  },
  {
    title: "菇菇寶貝在哪打？",
    summary: "最多在可疑的山丘（20 個刷怪點），一共出現在 24 張圖。",
    publishAt: "2026-11-19T11:00:00.000Z",
    main: "LaukYcq3RF4",
    shorts: "RI6uoudT3Bk",
    tool: { href: "/db/monsters/1210102", text: "菇菇寶貝資料" },
  },
  {
    title: "黑木妖在哪打？",
    summary: "最多在東方岩石山Ⅱ（28 個刷怪點），一共出現在 24 張圖。",
    publishAt: "2026-11-19T01:00:00.000Z",
    shorts: "DU9HCBAffwc",
    tool: { href: "/db/monsters/1110101", text: "黑木妖資料" },
  },
  {
    title: "巨人之林怎麼去？",
    summary: "從奇幻村出發 6 段、經過 7 張圖，每段走哪個門。",
    publishAt: "2026-11-19T07:00:00.000Z",
    shorts: "PQU5YSN1B9w",
    tool: { href: "/go?to=105040306&from=105040300", text: "地圖導航" },
  },
  {
    title: "一天 100 枚楓葉商會硬幣要打多久？",
    summary: "57 等鏢賊實機打黑鱷魚，100 枚拿滿花了 1 小時 35 分，還噴了一張手套攻擊卷 60%。",
    publishAt: "2026-11-20T06:50:00.000Z",
    main: "-a-1uWcQCP4",
    shorts: "AGlAeBNQpK0",
    tool: { href: "/plan/leaf", text: "楓葉衝卷規劃器" },
  },
  {
    title: "楓葉商會硬幣 繞整張圖 vs 守最下層",
    summary: "52 等冰雷實機打月光精靈：守最下層 20 分 48 秒拿滿 50 枚，比繞整張圖快 11 分鐘。",
    publishAt: "2026-11-20T06:50:00.000Z",
    main: "OnUvjdYFRXU",
    shorts: "t_2h4HIgyNQ",
    tool: { href: "/plan/leaf", text: "楓葉衝卷規劃器" },
  },
  {
    title: "打楓葉商會硬幣 沼澤巨鱷自己跑出來",
    summary: "鱷魚潭Ⅱ打幣打到一半，65 等沼澤巨鱷出現，噴了一張手套攻擊卷軸 60%。",
    publishAt: "2026-11-20T06:50:00.000Z",
    shorts: "wsNkggtYeRQ",
    tool: { href: "/plan/leaf", text: "楓葉衝卷規劃器" },
  },
  {
    title: "終於出了超懷舊的楓葉武器",
    summary: "200 枚楓葉商會硬幣換楓葉拳套：43 等、攻擊 23、迴避 20、可衝 7 次。",
    publishAt: "2026-11-20T06:50:00.000Z",
    shorts: "088_ecL7_hA",
    tool: { href: "/plan/leaf", text: "楓葉衝卷規劃器" },
  },
  {
    title: "守最下層 50 枚楓葉商會硬幣要多久？",
    summary: "52 等冰雷只守雲彩公園Ⅳ最下層，20 分 48 秒拿滿 50 枚。",
    publishAt: "2026-11-20T06:50:00.000Z",
    shorts: "YvXpOftfdwI",
    tool: { href: "/plan/leaf", text: "楓葉衝卷規劃器" },
  },
  {
    title: "泰里送好禮",
    summary: "11/19～2/17 到弓箭手村或天空之城找泰里，領炎魔之手交換券、暴風成長祕藥、經驗 2 倍券。",
    publishAt: "2026-11-21T17:20:17.000Z",
    main: "tG0-ikrhl54",
    shorts: "dDWlw5rTUpg",
  },
  {
    title: "手機 Beta 開放",
    summary: "Android 先開放，從官網公告下載 APK；不能組隊任務、商城、強化，要用帳號密碼或 OTP 登入。",
    publishAt: "2026-11-21T17:20:49.000Z",
    main: "6nbCENFUjzo",
    shorts: "LONi3Yhk4Tg",
  },
  {
    title: "地鐵二號線[01]怎麼去？",
    summary: "從墮落城市出發 4 段、經過 5 張圖，每段走哪個門。",
    publishAt: "2026-11-22T04:00:00.000Z",
    main: "jDiQBXqxMbU",
    shorts: "y-DpRSA8VGs",
    tool: { href: "/go?to=103000200&from=103000000", text: "地圖導航" },
  },
  {
    title: "綠菇菇在哪打？",
    summary: "最多在北部森林訓練場Ⅵ（33 個刷怪點），一共出現在 34 張圖。",
    publishAt: "2026-11-22T11:00:00.000Z",
    main: "69mg0dL9IRA",
    shorts: "GD_z0PSQ91c",
    tool: { href: "/db/monsters/1110100", text: "綠菇菇資料" },
  },
  {
    title: "殭屍菇菇在哪打？",
    summary: "最多在螞蟻洞Ⅲ（62 個刷怪點），一共出現在 10 張圖。",
    publishAt: "2026-11-22T11:00:00.000Z",
    main: "pu55L0bf8_w",
    shorts: "1l7ZRB_xDYc",
    tool: { href: "/db/monsters/2230101", text: "殭屍菇菇資料" },
  },
];

/** 已經公開的集數，新的在前 */
export function visibleEpisodes(now: number): VideoEpisode[] {
  return EPISODES.filter(ep => Date.parse(ep.publishAt) <= now).sort((a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt));
}

export const coverSrc = (id: string) => `/videos/${id}.webp`;
