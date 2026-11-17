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
];

/** 已經公開的集數，新的在前 */
export function visibleEpisodes(now: number): VideoEpisode[] {
  return EPISODES.filter(ep => Date.parse(ep.publishAt) <= now).sort((a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt));
}

export const coverSrc = (id: string) => `/videos/${id}.webp`;
