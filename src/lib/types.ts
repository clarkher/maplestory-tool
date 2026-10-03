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
  /** 屬性抗性：鍵取首字母 f/i/l/p/h，值 i=免疫 s=抗 w=弱 */
  el?: Record<string, string>;
  /** Artale 宣告這隻怪出現的地圖 */
  maps: number[];
  /** [地圖, 刷怪點數, mobTime 秒（0 = 預設）] */
  sp?: [number, number, number][];
  drops: number[];
};

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
  sh?: number;
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
  levels: Record<string, number>[];
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
  /** 職業代碼；0 代表初心者／未選 */
  job: number;
};
