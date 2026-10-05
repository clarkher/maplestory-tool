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

/**
 * 選了某個職業後的角色資料：等級不夠就調到該職業最低等級，並回傳要給玩家看的提示（沒調就是 null）。
 * typed 是輸入框裡打了、但被原本職業擋下的等級（狂戰士狀態下打 25）：新職業允許就直接套用；
 * 不允許就照舊。呼叫端把輸入框改成回傳的 next.level，輸入框跟標題就不會對不起來。
 */
export function profileWithJob(
  profile: { level: number; job: number },
  job: number,
  typed?: number,
): { next: { level: number; job: number }; note: string | null } {
  if (typed !== undefined && typed > 0 && typed !== profile.level && levelHint(job, typed) === null) {
    return { next: { job, level: typed }, note: null };
  }
  const need = minLevelFor(job);
  const name = job === 0 ? "初心者" : jobOption(job)?.name ?? "這個職業";
  if (profile.level > 0 && profile.level < need) return { next: { job, level: need }, note: `${name} ${need} 等起，等級改成 ${need}` };
  return { next: { ...profile, job }, note: null };
}

/** 打的等級比職業最低等級還低時的提示；沒問題回 null */
export function levelHint(job: number, level: number): string | null {
  const need = minLevelFor(job);
  if (level >= need) return null;
  return `${jobOption(job)?.name ?? "這個職業"}至少 ${need} 等`;
}

/** 輸入框裡的字轉成數字；沒有數字回 NaN */
function digitsOf(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : Number.NaN;
}

/**
 * 打字當下要不要套用：只套用這個職業允許、又沒超過上限的等級，其他先等，也不給提示——
 * 要打 15 先打了 1，不能閃一下「弩弓手至少 30 等」。真正的檢查在離開輸入框時（commitLevelText）。
 */
export function typedLevel(raw: string, job: number, cap: number): number | null {
  const value = digitsOf(raw);
  if (!Number.isFinite(value) || value < 1 || value > cap || levelHint(job, value) !== null) return null;
  return value;
}

/**
 * 離開輸入框或按 Enter 時，輸入框跟標題要對得起來：
 * 空白、不是數字、小於 1 → 默默改回現在的等級；超過上限 → 改成上限並說一聲；
 * 比職業最低等級低 → 原本的提示（狂戰士至少 30 等），等級不動；其他照打的套用。
 */
export function commitLevelText(raw: string, profile: { level: number; job: number }, cap: number): { level: number; hint: string | null } {
  const value = digitsOf(raw);
  if (!Number.isFinite(value) || value < 1) return { level: profile.level, hint: null };
  if (value > cap) return { level: cap, hint: `目前等級上限 Lv.${cap}` };
  const tooLow = levelHint(profile.job, value);
  if (tooLow) return { level: profile.level, hint: tooLow };
  return { level: value, hint: null };
}

/**
 * 換職業，並處理手滑：選的職業把等級拉高時（劍士 18 → 狂戰士 → 30），記住拉高前的等級（raisedFrom）；
 * 之後點的職業允許那個等級，就改回去、忘掉。輸入框裡另外打的等級（typed，見 profileWithJob）優先，打了就不再還原。
 * 呼叫端把回傳的 raisedFrom 存起來，下次換職業時傳回來；玩家自己改等級（打字、加減）時要清掉。
 */
export function pickJobKeepingLevel(
  profile: { level: number; job: number },
  job: number,
  typed: number | undefined,
  raisedFrom: number | null,
): { next: { level: number; job: number }; note: string | null; raisedFrom: number | null } {
  const typedApplies = typed !== undefined && typed > 0 && typed !== profile.level && levelHint(job, typed) === null;
  if (!typedApplies && raisedFrom !== null && levelHint(job, raisedFrom) === null) {
    return { next: { job, level: raisedFrom }, note: null, raisedFrom: null };
  }
  const { next, note } = profileWithJob(profile, job, typed);
  if (typedApplies) return { next, note, raisedFrom: null };
  const raised = profile.level > 0 && next.level > profile.level;
  return { next, note, raisedFrom: raised ? raisedFrom ?? profile.level : raisedFrom };
}
