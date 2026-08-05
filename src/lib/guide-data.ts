/**
 * 懶人包內容。
 *
 * 這一頁是「整理網路攻略」而不是「客戶端資料推導」，所以跟站上其他頁的性質不同：
 * 每一條都要有出處（sources 列在頁尾），台服經典版實測與舊版經驗沿用要分開標。
 * 地圖 id 對照過站內資料（public/data/maps.json），「帶我去」才能直接導航。
 *
 * 內容彙整自（2026-08-05 查證）：
 *  - 波波攻略島：練功路線、月妙攻略、超綠攻略、五大職業、技能配點
 *  - mapleclassictools.com：開服練功指南、轉職流程
 *  - 巴哈姆特經典版哈啦板：新手 1~30／月妙年糕帽教學／超綠逃課流
 *  - NOWnews／4Gamers：月妙流程報導
 */

export type GuideStep = {
  /** 等級區間 */
  range: string;
  title: string;
  /** 主要做法 */
  what: string;
  /** 為什麼 / 細節 */
  detail?: string;
  /** 站內地圖 id，接「帶我去」 */
  mapId?: number;
  mapName?: string;
  /** 相關怪物（站內 id） */
  mobs?: Array<{ id: number; name: string; lv: number }>;
  /** 台服實測 or 舊版經驗 */
  verified: "tw" | "legacy";
};

export type JobGuide = {
  key: string;
  name: string;
  /** 轉職資訊 */
  advancement: {
    level: string;
    stat: string;
    npc: string;
    place: string;
    mapId?: number;
  };
  /** 素質配點 */
  build: string;
  /** 一轉技能加點順序 */
  skills: string;
  /** 這個職業 1–30 的特別之處；沒有就走共通路線 */
  notes?: string;
};

/** 共通主線：五個職業都適用的骨幹路線 */
export const COMMON_ROUTE: GuideStep[] = [
  {
    range: "1–10",
    title: "楓之島：跟著新手任務走就好",
    what: "不用刻意練功。島上任務經驗優渥，大致清完就有 Lv.7~10。",
    detail: "法師 Lv.8 就能離島轉職，其他職業 Lv.10。晚點轉也不虧——缺的技能點會在轉職時一次補齊。",
    mapId: 40000,
    mapName: "嫩寶狩獵場Ⅰ",
    mobs: [
      { id: 100100, name: "嫩寶", lv: 1 },
      { id: 100101, name: "藍寶", lv: 2 },
    ],
    verified: "tw",
  },
  {
    range: "10（法師 8）",
    title: "出島轉職",
    what: "搭船到維多利亞島，去自己職業的村子找轉職教官（各職業位置見下方）。",
    detail: "轉職前把素質練到門檻：劍士力量 35、法師智力 20、弓箭手／盜賊敏捷 25、海盜敏捷 20。",
    verified: "tw",
  },
  {
    range: "10–21",
    title: "月妙組隊任務（最快主線）",
    what: "弓箭手村 → 邱比特公園找 NPC 達爾利，3~6 人組隊。一場 1,600 經驗、熟練約 2.5~4.5 分鐘，可連刷、不太耗水錢。",
    detail: "流程：打花草怪掉六色種子 → 按位置種（左上藍、左中黃、左下黃褐、右上綠、右中紫、右下紫紅）→ 保護月妙搗滿 10 個年糕交給老虎「興兒」。月妙被打到會哭、停手，顧好它是成敗關鍵。累積 20 個年糕可換「頭頂上的一個年糕」帽子（+50 HP）。組隊訣竅：頻道 1 揪人，組好換頻道避開排隊。",
    mapId: 100000200,
    mapName: "邱比特公園",
    verified: "tw",
  },
  {
    range: "10–21（單練備案）",
    title: "不想組隊：肥肥海岸、綠水靈",
    what: "肥肥海岸打肥肥（Lv7）與緞帶肥肥（Lv10）；或南部森林訓練場一帶打綠水靈（Lv6）。",
    detail: "人潮多就先換頻道再換圖。打起來吃力就退回低一階的怪，效率反而穩。",
    mapId: 104010001,
    mapName: "肥肥海岸",
    mobs: [
      { id: 1210100, name: "肥肥", lv: 7 },
      { id: 1210101, name: "緞帶肥肥", lv: 10 },
      { id: 210100, name: "綠水靈", lv: 6 },
    ],
    verified: "legacy",
  },
  {
    range: "21–30",
    title: "超綠組隊任務（第二段主線）",
    what: "墮落城市找 NPC 拉克里斯，4 人組隊。五關合計約 4,800 經驗（700+300+500+800+2500）。",
    detail: "實務上約 25 等再下場比較舒服，21 等剛達標會很耗藥水。第一關答題張數：法師轉職等級 8、其他職業 10、升 2 等經驗 15、法師智力 20、弓／盜敏捷 25、劍士力量 35。第四關跳桶從 456 開始試最順。進王關前把優惠券丟地上——死亡會被吞。王關 BOSS 有機率掉「黏稠稠鞋子」，同隊先講好分配。",
    mapId: 103000000,
    mapName: "墮落城市",
    verified: "tw",
  },
  {
    range: "21–30（單練備案）",
    title: "不想組隊：螞蟻洞",
    what: "沉睡森林方向的螞蟻洞，打刺菇菇（Lv22）與殭屍菇菇（Lv24）。",
    detail: "組不到隊或想邊掛邊解任務時的經典答案。任務斷檔也來這裡補。",
    mapId: 105050000,
    mapName: "螞蟻洞Ⅰ",
    mobs: [
      { id: 2110200, name: "刺菇菇", lv: 22 },
      { id: 2230101, name: "殭屍菇菇", lv: 24 },
    ],
    verified: "legacy",
  },
];

export const JOB_GUIDES: JobGuide[] = [
  {
    key: "warrior",
    name: "劍士",
    advancement: {
      level: "Lv.10",
      stat: "力量 35",
      npc: "武術教練",
      place: "勇士之村・勇者聖殿",
      mapId: 102000000,
    },
    build: "敏捷點到「等於等級」能穿裝就好，其餘全力量。",
    skills: "生命淨化 5 → 生命擴展 10 → 魔天一擊 20 → 劍氣縱橫 20 → 剩餘補生命淨化／恢復。",
    notes: "超綠王關打飛行怪吃命中，板上有「超綠不收劍士」的風氣（無官方限制）。被拒收就找逃課團（只刷第一關），或這段改走螞蟻洞單練。",
  },
  {
    key: "magician",
    name: "法師",
    advancement: {
      level: "Lv.8",
      stat: "智力 20",
      npc: "漢斯",
      place: "魔法森林・魔法圖書館",
      mapId: 101000000,
    },
    build: "全智力。",
    skills: "魔力淨化 5 → 魔力擴展 10 → 魔靈彈 1 → 魔力爪 20 → 魔力淨化補滿 → 魔心防禦。",
    notes: "唯一 Lv.8 就能轉職的職業，出島最早。前期魔靈彈點 1 級就夠用，主力放魔力爪。",
  },
  {
    key: "archer",
    name: "弓箭手",
    advancement: {
      level: "Lv.10",
      stat: "敏捷 25",
      npc: "赫麗娜",
      place: "弓箭手村・弓箭手培育中心",
      mapId: 100000000,
    },
    build: "獵人：力量＝等級＋5，其餘全敏捷。弩手：力量＝等級。",
    skills: "斷魂箭 1 → 二連箭 20 → 精準強化 3 → 百步穿楊 8 → 霸王箭 20 → 精準強化補滿。",
    notes: "轉職村就是月妙入口所在的弓箭手村，10–21 這段最方便。",
  },
  {
    key: "thief",
    name: "盜賊",
    advancement: {
      level: "Lv.10",
      stat: "敏捷 25",
      npc: "達克魯",
      place: "墮落城市・盜賊基地的酒吧",
      mapId: 103000000,
    },
    build: "主幸運，敏捷點到裝備需求即止（常見比例約敏 2：幸 3）。",
    skills: "雙飛斬 20 → 幻化術 20 → 鷹之眼 8 → 詛咒術 3 → 隱身術 1，餘 9 點自由。",
    notes: "轉職村就是超綠入口所在的墮落城市，21–30 這段最方便。",
  },
  {
    key: "pirate",
    name: "海盜",
    advancement: {
      level: "Lv.10",
      stat: "敏捷 20",
      npc: "卡伊琳",
      place: "鯨魚號・右側上層通道底的房間",
      mapId: 120000000,
    },
    build: "打手 4 力 1 敏；槍手 4 敏 1 力。",
    skills: "走打手：極限迴避 20 → 衝擊拳 11 → 旋風斬 20 → 衝鋒 10。走槍手：極限迴避 20 → 旋風斬 11 → 雙子星攻擊 20 → 衝鋒 10。",
    notes: "轉職考核在考場打章魚，只能用雙子星攻擊過關。10–15 這段也可以去打三眼章魚（Lv12）。",
  },
];

export const GUIDE_SOURCES = [
  { name: "波波攻略島：練功路線彙整", url: "https://bobogameguides.com/maplestory-classic/guides/leveling-routes.html" },
  { name: "波波攻略島：月妙組隊任務攻略", url: "https://bobogameguides.com/maplestory-classic/guides/moon-bunny-pq.html" },
  { name: "波波攻略島：超綠組隊任務攻略", url: "https://bobogameguides.com/maplestory-classic/guides/king-slime-pq.html" },
  { name: "波波攻略島：五大職業轉職與配點", url: "https://bobogameguides.com/maplestory-classic/guides/jobs-overview.html" },
  { name: "波波攻略島：一二轉技能一覽", url: "https://bobogameguides.com/maplestory-classic/guides/skills-overview.html" },
  { name: "mapleclassictools：開服 Lv.1~30 練功路線", url: "https://mapleclassictools.com/guides/launch-leveling-guide/" },
  { name: "mapleclassictools：轉職流程", url: "https://mapleclassictools.com/guides/job-advancement-guide/" },
  { name: "巴哈姆特經典版哈啦板：新手 1~30／月妙／超綠", url: "https://forum.gamer.com.tw/C.php?bsn=85994&snA=304" },
  { name: "NOWnews：前期衝等報導", url: "https://www.nownews.com/news/6861250" },
] as const;

export const GUIDE_UPDATED_AT = "2026-08-05";
