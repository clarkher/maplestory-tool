/**
 * 經典版的 17 個職業：一轉 5 職（還沒二轉時選這個）＋二轉 12 職。
 * 皇家騎士團、狂狼勇士、龍魔導士、影武者是客戶端資料裡有、經典版沒有的，不列。
 */

export type JobOption = {
  id: number;
  name: string;
  /** 所屬系別（一轉職業名） */
  line: string;
  /** 轉職教官，頭像用他的遊戲圖 */
  npcId: number;
  npcName: string;
};

type JobLine = { base: number; line: string; npcId: number; npcName: string; branches: Array<[number, string]> };

export const JOB_LINES: JobLine[] = [
  { base: 100, line: "劍士", npcId: 1022000, npcName: "武術教練", branches: [[110, "狂戰士"], [120, "見習騎士"], [130, "槍騎兵"]] },
  { base: 200, line: "法師", npcId: 1032001, npcName: "漢斯", branches: [[210, "火毒巫師"], [220, "冰雷巫師"], [230, "僧侶"]] },
  { base: 300, line: "弓箭手", npcId: 1012100, npcName: "赫麗娜", branches: [[310, "獵人"], [320, "弩弓手"]] },
  { base: 400, line: "盜賊", npcId: 1052001, npcName: "達克魯", branches: [[410, "刺客"], [420, "俠盜"]] },
  { base: 500, line: "海盜", npcId: 1090000, npcName: "卡伊琳", branches: [[510, "打手"], [520, "槍手"]] },
];

export const JOB_OPTIONS: JobOption[] = JOB_LINES.flatMap(line => [
  { id: line.base, name: line.line, line: line.line, npcId: line.npcId, npcName: line.npcName },
  ...line.branches.map(([id, name]) => ({ id, name, line: line.line, npcId: line.npcId, npcName: line.npcName })),
]);

const BY_ID = new Map(JOB_OPTIONS.map(job => [job.id, job]));

/** 二轉以上開放的等級 */
export const SECOND_JOB_LEVEL = 30;

export function baseJob(job: number): number {
  return job > 0 ? Math.floor(job / 100) * 100 : 0;
}

export function isSecondJob(job: number): boolean {
  return BY_ID.has(job) && job % 100 !== 0;
}

/** 一轉的等級：法師 8 等，其他 10 等 */
export function advancementLevel(job: number): number {
  return baseJob(job) === 200 ? 8 : 10;
}

/** 本機存過的舊代碼（例如皇家騎士團 1110）不在經典版，當作初心者；-1 是還沒選職業 */
export function normalizeJob(job: number): number {
  if (job < 0) return -1;
  return BY_ID.has(job) ? job : 0;
}

/**
 * 這個等級實際是哪一轉：還沒到轉職等級就是初心者（0），
 * 選了二轉職業但還沒到 30 等就用一轉的。
 */
export function stageJob(job: number, level: number): number {
  if (job <= 0 || level < advancementLevel(job)) return 0;
  if (!isSecondJob(job)) return job;
  return level >= SECOND_JOB_LEVEL ? job : baseJob(job);
}

export function jobOption(job: number): JobOption | undefined {
  return BY_ID.get(job);
}

/**
 * 選了這個職業最低要幾等。選了就代表已經轉職，不會有「二轉 25 等」這種組合：
 * 初心者／還沒選 1、法師 8、其他一轉 10、二轉 30。
 */
export function minLevelFor(job: number): number {
  if (job <= 0) return 1;
  return isSecondJob(job) ? SECOND_JOB_LEVEL : advancementLevel(job);
}

/**
 * 本機存過的不可能組合（舊版允許「選二轉、等級 25」）改成實際那一轉，等級不動：
 * 二轉未滿 30 → 一轉職業；一轉未滿轉職等級 → 初心者。不認得的舊代碼原樣回傳（交給 normalizeJob）。
 */
export function consistentJob(job: number, level: number): number {
  if (job <= 0 || level <= 0) return job;
  if (isSecondJob(job) && level < SECOND_JOB_LEVEL) return level >= advancementLevel(job) ? baseJob(job) : 0;
  if (BY_ID.has(job) && !isSecondJob(job) && level < advancementLevel(job)) return 0;
  return job;
}
