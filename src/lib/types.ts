/** 對應 pipeline/build.mjs 輸出的資料格式。欄位刻意用短名，檔案要小。 */

export type MapRecord = {
  /** 中文名。沒有中文名代表這張圖屬於尚未開放的內容 */
  zh: string;
  /** 所屬街道／區域名 */
  st: string;
  /** 1 = 這是別的地圖的回城點，也就是玩家心中的城鎮 */
  t?: 1;
  /** 回城點地圖 id */
  ret?: number;
  /** 世界地圖標記 key */
  mk?: string;
  /** 所屬世界地圖區域 key */
  rg?: string;
  /** 客戶端的刷怪倍率 */
  rate?: number;
  /** 1 = 有小地圖圖檔 */
  mm?: 1;
  /** V002 才放行的地圖才有：開放日（YYYY-MM-DD，目前只有 "2026-10-15"），過了這天 src/lib/release.ts 判定已開放 */
  o?: string;
};

/** [目標地圖, 傳送門名稱, x, y] */
export type PortalEdge = [number, string, number, number];

export type Monster = {
  id: number;
  n: string;
  un?: 1;
  lv: number | null;
  exp: number;
  hp: number;
  pad: number;
  pdd: number;
  mad: number;
  mdd: number;
  acc: number;
  eva: number;
  spd: number;
  und?: 1;
  /** 屬性抗性：鍵 f/i/l/p/h/d（火冰雷毒聖暗），值 i=免疫 r=抗 w=弱；上游寫法怎麼對過來見 pipeline/lib/elemental.mjs */
  el?: Record<string, string>;
  /** Artale 宣告這隻怪出現的地圖 */
  maps: number[];
  /** [地圖, 刷怪點數, 等效回生秒數]：同一隻怪好幾個刷怪點時合成的秒數（pipeline/lib/spawns.mjs），0 = 預設 7 秒 */
  sp?: [number, number, number][];
  drops: number[];
};

/**
 * 道具「哪裡買得到」的一家店（pipeline/lib/shops.mjs，只列經典版已開放的地方）。
 * p 地點、n NPC（商城沒有）、m 地點的地圖 id（看是不是 10/15 才開放）、pr 標價、
 * k 一組幾個（1 個不寫）、c=1 商城的樂豆點（沒寫是楓幣）、o=1 取自舊版資料（經典版實際可能不同）。
 */
export type ShopRow = { p: string; n?: string; m?: number; pr: number; k?: number; c?: 1; o?: 1 };

export type Item = {
  id: number;
  n: string;
  d?: string;
  c: string;
  s?: string;
  un?: 1;
  eq?: Record<string, number | string>;
  /** 會掉這個道具的怪物 id */
  dm?: number[];
  /** 給這個道具當獎勵的任務 id */
  qr?: string[];
  /** 需要這個道具的任務 id */
  qq?: string[];
  /** 店家數（含還沒開放城鎮的店）；v002.ts 用來判斷「有店賣就不是 V002 限定」 */
  sh?: number;
  /** 哪裡買得到（見 ShopRow） */
  sp?: ShopRow[];
  cf?: number[];
  /** NPC 商店的最高標價，用來估「撿了值不值得」 */
  price?: number;
};

export type QuestRef = { id: number; n: string; c?: number };

/** 獎勵道具。rand=1 代表是「一堆裡隨機給一樣」，job 代表只有該職業拿得到。 */
export type QuestReward = QuestRef & { rand?: 1; job?: number };
export type QuestNpc = { id: number; n: string; map?: number; mapName?: string };

/** 任務敘述的一段：可接前／進行中／完成後 */
export type QuestText = { k: string; label: string; text: string };

export type Quest = {
  id: string;
  n: string;
  cat: string;
  parent?: string;
  minLv?: number;
  maxLv?: number;
  /**
   * 可接的職業代碼。沒有這個欄位代表不限職業；
   * `[0]` 是初心者專屬（轉職前任務與楓之島任務），不是不限職業。
   */
  jobs?: number[];
  pre?: string[];
  next?: string;
  sNpc?: QuestNpc;
  eNpc?: QuestNpc;
  /** 這個任務還牽涉到的其他 NPC */
  npcs?: QuestNpc[];

  /** 完成條件 */
  needItems?: QuestRef[];
  needMobs?: QuestRef[];
  /** 接取條件 */
  startItems?: QuestRef[];
  startSkills?: number[];

  /** 完成獎勵 */
  exp?: number;
  money?: number;
  pop?: number;
  rewardItems?: QuestReward[];
  rewardSkills?: number[];
  /** 接受任務當下就給的 */
  startExp?: number;
  startGiven?: QuestReward[];

  medal?: string;
  /** 1 = 起始地點在楓之島，離島後接不到 */
  island?: 1;
  texts?: QuestText[];
};

export type Skill = {
  id: number;
  n: string;
  job: number;
  jobName: string;
  group: string;
  adv: string;
  max?: number;
  desc?: string;
  formula?: string;
  labels?: Record<string, string>;
  /**
   * 每一級的數值。遊戲資料裡沒有分等級資料的技能（神匠之魂、怪物騎乘、肥肥的弱點攻擊…，上游 levels 是空的）
   * 沒有這個欄位：建置時 dropEmpty 把空陣列拿掉了。畫面怎麼列見 skill-view.ts
   */
  levels?: Record<string, number>[];
  /**
   * 遊戲每一級的說明原文（上游 levels[].description，例「消耗MP10, 攻擊力55%, 對一名怪物兩次攻擊」），鍵是級數。
   * 只留卡片用得到的（pipeline/lib/skill-text.mjs）：好幾級又沒有數值的那幾級（槍連擊整個技能、隱身術 20 級）、
   * 有數值的技能的最高級（「滿級效果」那一行）。一筆都沒有就沒有這個欄位
   */
  levelText?: Record<string, string>;
  /**
   * 所需技能（從說明尾巴「所需技能：魔天一擊1等級以上」拆出來，pipeline/lib/skill-text.mjs）。
   * id 是同一條職業線裡名字完全一樣的那個技能，卡片做成連結；上游的字對不上技能名的（例「劍技專精」）沒有 id、只列名字
   */
  req?: { name: string; level: number; id?: number }[];
};

export type Job = {
  id: number;
  name: string;
  group: string;
  groupOrder: number;
  adv: string;
  advOrder: number;
};

export type TrainingRow = {
  m: number;
  /** 刷怪點總數 */
  sp: number;
  /** 全圖清一輪的總經驗 */
  exp1: number;
  hp: number;
  /** 排序用密度值，只有相對大小有意義 */
  eff: number;
  /** 平均回生秒數 */
  resp: number;
  lv: number;
  lvMin: number;
  lvMax: number;
  /** 這張圖有幾個刷怪點的怪不在 Artale 圖鑑裡 */
  unk?: number;
  /** [怪物 id, 刷怪點數, 等效回生秒數（0 = 預設 7 秒）]，刷怪點多的在前 */
  mobs: [number, number, number][];
};

/** [地圖, 刷怪點總數, 會掉這個道具的怪物 id] */
export type FarmingRow = [number, number, number[]];

export type Region = {
  key: string;
  title: string;
  maps: number[];
  spots: [number, number, number][];
};

/** [類型, id, 名稱, 附註] 類型：m 怪 / i 道具 / q 任務 / s 技能 / p 地圖 */
export type SearchRow = ["m" | "i" | "q" | "s" | "p", number | string, string, string | number];

export type Meta = {
  gameVersion: string | null;
  dataGeneratedAt: string | null;
  dataGeneratedAtText: string | null;
  ingest: { origin: string; ref: string; fetchedAt: string } | null;
  mapSource: { source: string; url: string; extractedAt: string };
  release: {
    version: string;
    operator: string;
    launchedAt: string;
    levelCap: number;
    maxAdvancementOrder: number;
    regions: string[];
    /** 已開放的地區（上游資料的地區名），地圖要在這裡面才收錄 */
    mapRegions?: string[];
    note: string;
  };
  /** 上游各資料檔的版本；gameVersion 取其中最新的 */
  parts?: Record<string, { gameVersion: string | null; generatedAt: string | null }>;
  /** 客戶端已有中文名、但地區還沒開放而沒收錄的地圖數，依地區分 */
  heldBackRegions?: Record<string, number>;
  /** 已開放地圖的刷怪資料，各有幾張用台服客戶端、幾張退回 v83 */
  spawnSource?: { client: number; v83: number };
  assumptions: {
    defaultRespawnSeconds: number;
    expNote: string;
    dropNote: string;
    routeNote: string;
  };
  counts: Record<string, number>;
  coverage: Record<string, number>;
  builtAt: string;
};

export type PlanMode = "quest" | "train" | "farm";

export type Profile = {
  level: number;
  /** 職業代碼；0 代表初心者，-1 代表還沒選 */
  job: number;
};

/* ------------------------------------------------------------------ 玩家攻略（pipeline/build-guides.mjs 輸出） */

/** tw = 台服經典版玩家實測；legacy = BigBang 前舊版經驗；community = 經典版社群整理、沒說實測 */
export type Verified = "tw" | "legacy" | "community";

export type GuideSkillStep = { id: number | null; name: string; to: number; note?: string };

export type GuideBuild = {
  label: string;
  /** 研究時判定為主流點法 */
  main: boolean;
  v: Verified;
  s: string[];
  steps: GuideSkillStep[];
};

export type GuideTrain = {
  from: number;
  to: number;
  kind: "solo" | "party";
  /** 站內地圖 id；沒有中文名（未開放或跨多圖）時為 null，不能導航 */
  map: number | null;
  name: string;
  mobs: number[];
  why: string;
  v: Verified;
  s: string[];
  /** 這個組隊段落對應的組隊任務（pq.json 的 key）；不是組隊任務就沒有 */
  pq?: string;
};

export type GuideJob = {
  job: number;
  name: string;
  stat: Array<{ t: string; v: Verified; s: string[] }>;
  builds: GuideBuild[];
  train: GuideTrain[];
  notes: Array<{ t: string; s: string[] }>;
  /** 研究時確認「這段找不到可靠攻略」的等級區間與說明 */
  gaps: Array<{ from: number; to: number; t: string; s: string[] }>;
  notOpenYet: Array<{ from: number; to: number; place: string; s: string[] }>;
};

/**
 * 關鍵獎勵：畫面上的標籤，與用來放圖的遊戲道具 id（抽獎型的 label 寫「隨機」）。
 * permanent：任何等級都有用（冒險家的戒指的永久戒指），這條任務不會因為等級過了建議範圍就不推。
 */
export type GuideReward = { label: string; items: number[]; permanent?: boolean };

/**
 * 組隊任務：入口地圖、圖解連結、各職業打它的等級範圍（從攻略的組隊段落整理，build 時已裁進遊戲任務的等級限制）。
 * quest 是對應的遊戲任務 id（月妙的年糕 1200、第一次同行 1201）。
 */
export type GuidePq = { key: string; name: string; quest?: string; entrance: number; guide: string; byJob: Record<string, [number, number]> };

export type GuideMustDo = {
  q: string;
  /** 同一條任務線的其他任務 id，一起標成推薦 */
  chain: string[];
  name: string;
  lv: string;
  why: string;
  v: Verified;
  s: string[];
  reward?: GuideReward;
};

export type GuideCommon = {
  researchedAt: string;
  builtAt: string;
  expTable: {
    /** toNext[n] = 從 Lv.n 升到 n+1 要的經驗；toNext[0] 不用 */
    toNext: number[];
    conflicts: Array<{ level: number; values: Array<{ value: number; source: string; note?: string }> }>;
    v: Verified;
    s: string[];
  };
  mustDo: GuideMustDo[];
  notWorth: Array<{ q: string; related: string[]; name: string; why: string; s: string[] }>;
  pq?: GuidePq[];
  /** 主流點法點完還有剩點時，攻略怎麼說 */
  spLeftover?: { t: string; s: string[] };
};
